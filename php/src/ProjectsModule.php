<?php
declare(strict_types=1);

namespace Tds\Ext\Projects;

use PDO;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\App;
use Tds\Ext\Projects\Domain\ProjectRepository;
use Tds\Frontend\Contract\AbstractModule;
use Tds\Frontend\Contract\ApiDocSource;
use Tds\Frontend\Contract\PermissionDef;
use Tds\Frontend\Contract\UserContext;

/**
 * Backend Module for the project + milestone directory, ported from
 * tds-customer-api's Project actions.
 *
 * Customer (portal) routes require `projects:read` and are scoped by
 * `activeCompanyId()` (read-only — customers view their projects + milestone
 * progress). Admin (owner) routes require `isAdmin` and manage any project +
 * its milestones. Data via the core shared PDO.
 */
final class ProjectsModule extends AbstractModule implements ApiDocSource
{
    public function id(): string
    {
        return 'projects';
    }

    /** @return PermissionDef[] */
    public function permissions(): array
    {
        return [
            new PermissionDef('projects:read', 'Projekte ansehen', 'projects'),
            new PermissionDef('projects:manage', 'Projekte verwalten (Owner)', 'projects'),
        ];
    }

    /** @return string[] */
    public function migrations(): array
    {
        return [__DIR__ . '/../db/migrations'];
    }

    public function register(App $app): void
    {
        $c = $app->getContainer();
        if ($c !== null && !$c->has(ProjectRepository::class)) {
            $c->set(ProjectRepository::class, static fn ($c) => new ProjectRepository($c->get(PDO::class)));
        }

        // --- Customer (portal, read-only) --------------------------------------
        $app->get('/projects/summary', function (Request $req, Response $res) use ($c): Response {
            $user = $c->get(UserContext::class);
            if (($deny = self::require($user, 'projects:read', $res)) !== null) {
                return $deny;
            }
            $cid = $user->activeCompanyId() !== null ? (int) $user->activeCompanyId() : null;
            return self::json($res, ['active' => $c->get(ProjectRepository::class)->activeCount($cid)]);
        });

        $app->get('/projects', function (Request $req, Response $res) use ($c): Response {
            $user = $c->get(UserContext::class);
            if (($deny = self::require($user, 'projects:read', $res)) !== null) {
                return $deny;
            }
            $cid = $user->activeCompanyId();
            if ($cid === null) {
                return self::json($res, ['projects' => []]);
            }
            return self::json($res, ['projects' => $c->get(ProjectRepository::class)->listForCustomer((int) $cid)]);
        });

        $app->get('/projects/{id:[0-9]+}', function (Request $req, Response $res, array $args) use ($c): Response {
            $user = $c->get(UserContext::class);
            if (($deny = self::require($user, 'projects:read', $res)) !== null) {
                return $deny;
            }
            $repo = $c->get(ProjectRepository::class);
            $id = (int) $args['id'];
            $project = $user->isAdmin() && $user->activeCompanyId() === null
                ? $repo->getAdmin($id)
                : $repo->getForCustomer($id, (int) ($user->activeCompanyId() ?? 0));
            if ($project === null) {
                return self::json($res, ['error' => 'Not found'], 404);
            }
            return self::json($res, ['project' => $project, 'milestones' => $repo->milestonesFor($id)]);
        });

        // --- Admin (owner) management ------------------------------------------
        $app->get('/admin/projects', function (Request $req, Response $res) use ($c): Response {
            if (($deny = self::requireAdmin($c->get(UserContext::class), $res)) !== null) {
                return $deny;
            }
            return self::json($res, ['projects' => $c->get(ProjectRepository::class)->listAllAdmin()]);
        });

        $app->post('/admin/projects', function (Request $req, Response $res) use ($c): Response {
            if (($deny = self::requireAdmin($c->get(UserContext::class), $res)) !== null) {
                return $deny;
            }
            $b = $req->getParsedBody();
            if (!is_array($b) || trim((string) ($b['title'] ?? '')) === '' || !isset($b['customer_id'])) {
                return self::json($res, ['error' => 'title and customer_id required'], 422);
            }
            $id = $c->get(ProjectRepository::class)->create((int) $b['customer_id'], $b);
            return self::json($res, ['id' => $id], 201);
        });

        $app->patch('/admin/projects/{id:[0-9]+}', function (Request $req, Response $res, array $args) use ($c): Response {
            if (($deny = self::requireAdmin($c->get(UserContext::class), $res)) !== null) {
                return $deny;
            }
            $b = $req->getParsedBody();
            if (!is_array($b) || trim((string) ($b['title'] ?? '')) === '') {
                return self::json($res, ['error' => 'title required'], 422);
            }
            $c->get(ProjectRepository::class)->update((int) $args['id'], $b);
            return self::json($res, ['id' => (int) $args['id']]);
        });

        $app->delete('/admin/projects/{id:[0-9]+}', function (Request $req, Response $res, array $args) use ($c): Response {
            if (($deny = self::requireAdmin($c->get(UserContext::class), $res)) !== null) {
                return $deny;
            }
            $ok = $c->get(ProjectRepository::class)->delete((int) $args['id']);
            return $ok ? self::json($res, ['deleted' => true]) : self::json($res, ['error' => 'Not found'], 404);
        });

        $app->post('/admin/projects/{id:[0-9]+}/milestones', function (Request $req, Response $res, array $args) use ($c): Response {
            if (($deny = self::requireAdmin($c->get(UserContext::class), $res)) !== null) {
                return $deny;
            }
            $b = $req->getParsedBody();
            if (!is_array($b) || trim((string) ($b['title'] ?? '')) === '') {
                return self::json($res, ['error' => 'title required'], 422);
            }
            $id = $c->get(ProjectRepository::class)->createMilestone((int) $args['id'], $b);
            return self::json($res, ['id' => $id], 201);
        });

        $app->patch('/admin/milestones/{id:[0-9]+}', function (Request $req, Response $res, array $args) use ($c): Response {
            if (($deny = self::requireAdmin($c->get(UserContext::class), $res)) !== null) {
                return $deny;
            }
            $b = $req->getParsedBody();
            if (!is_array($b) || trim((string) ($b['title'] ?? '')) === '') {
                return self::json($res, ['error' => 'title required'], 422);
            }
            $c->get(ProjectRepository::class)->updateMilestone((int) $args['id'], $b);
            return self::json($res, ['id' => (int) $args['id']]);
        });

        $app->delete('/admin/milestones/{id:[0-9]+}', function (Request $req, Response $res, array $args) use ($c): Response {
            if (($deny = self::requireAdmin($c->get(UserContext::class), $res)) !== null) {
                return $deny;
            }
            $ok = $c->get(ProjectRepository::class)->deleteMilestone((int) $args['id']);
            return $ok ? self::json($res, ['deleted' => true]) : self::json($res, ['error' => 'Not found'], 404);
        });
    }

    private static function require(UserContext $user, string $permission, Response $res): ?Response
    {
        if (!$user->isAuthenticated()) {
            return self::json($res, ['error' => 'Unauthorized'], 401);
        }
        if (!$user->has($permission)) {
            return self::json($res, ['error' => 'Forbidden'], 403);
        }
        return null;
    }

    private static function requireAdmin(UserContext $user, Response $res): ?Response
    {
        if (!$user->isAuthenticated()) {
            return self::json($res, ['error' => 'Unauthorized'], 401);
        }
        if (!$user->isAdmin()) {
            return self::json($res, ['error' => 'Forbidden'], 403);
        }
        return null;
    }

    private static function json(Response $res, mixed $data, int $status = 200): Response
    {
        $res->getBody()->write(json_encode($data, JSON_THROW_ON_ERROR));
        return $res->withStatus($status)->withHeader('Content-Type', 'application/json');
    }

    /**
     * Route documentation for the admin frontend's API reference. Kept in its
     * own file so the prose does not sit in the middle of the wiring.
     *
     * @return list<array<string, mixed>>
     */
    public function apiDocs(): array
    {
        return require __DIR__ . '/../docs/api.php';
    }
}
