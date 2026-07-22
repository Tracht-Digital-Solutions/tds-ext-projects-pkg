<?php
declare(strict_types=1);

namespace Tds\Ext\Projects\Tests;

use DI\Container;
use PHPUnit\Framework\TestCase;
use Slim\Factory\AppFactory;
use Slim\Psr7\Factory\ServerRequestFactory;
use Tds\Ext\Projects\ProjectsModule;
use Tds\Frontend\Contract\UserContext;

/** A configurable UserContext double (no live JWT needed). */
final class FakeUser implements UserContext
{
    /** @param string[] $perms */
    public function __construct(
        private bool $auth = true,
        private bool $admin = false,
        private array $perms = [],
        private ?int $company = null,
        private ?int $uid = 1,
    ) {
    }

    public function isAuthenticated(): bool
    {
        return $this->auth;
    }

    public function userId(): ?int
    {
        return $this->uid;
    }

    public function email(): ?string
    {
        return null;
    }

    public function isAdmin(): bool
    {
        return $this->admin;
    }

    /** @return string[] */
    public function permissions(): array
    {
        return $this->perms;
    }

    public function has(string $permission): bool
    {
        return $this->admin || in_array($permission, $this->perms, true);
    }

    public function activeCompanyId(): ?int
    {
        return $this->company;
    }
}

/**
 * Route + RBAC + validation coverage that needs no DB: auth checks and the
 * "no active company" path short-circuit before any repository (PDO) access.
 */
final class ProjectsModuleTest extends TestCase
{
    private function appWith(UserContext $user): \Slim\App
    {
        $container = new Container();
        $container->set(UserContext::class, $user);
        AppFactory::setContainer($container);
        $app = AppFactory::create();
        $app->addBodyParsingMiddleware();
        $app->addRoutingMiddleware();
        (new ProjectsModule())->register($app);
        return $app;
    }

    private function get(\Slim\App $app, string $path): \Psr\Http\Message\ResponseInterface
    {
        return $app->handle((new ServerRequestFactory())->createServerRequest('GET', $path));
    }

    /** @param array<string,mixed> $body */
    private function send(\Slim\App $app, string $method, string $path, array $body): \Psr\Http\Message\ResponseInterface
    {
        $req = (new ServerRequestFactory())->createServerRequest($method, $path)
            ->withHeader('Content-Type', 'application/json')
            ->withParsedBody($body);
        return $app->handle($req);
    }

    public function testMetadata(): void
    {
        $module = new ProjectsModule();
        self::assertSame('projects', $module->id());
        $ids = array_map(static fn ($p): string => $p->id, $module->permissions());
        self::assertSame(['projects:read'], $ids);
        self::assertDirectoryExists($module->migrations()[0]);
    }

    public function testUnauthenticatedListUnauthorized(): void
    {
        self::assertSame(401, $this->get($this->appWith(new FakeUser(auth: false)), '/projects')->getStatusCode());
    }

    public function testReadWithoutPermissionForbidden(): void
    {
        self::assertSame(403, $this->get($this->appWith(new FakeUser(perms: [])), '/projects')->getStatusCode());
    }

    public function testReaderWithoutCompanyGetsEmptyList(): void
    {
        $res = $this->get($this->appWith(new FakeUser(perms: ['projects:read'], company: null)), '/projects');
        self::assertSame(200, $res->getStatusCode());
        self::assertSame(['projects' => []], json_decode((string) $res->getBody(), true));
    }

    public function testAdminListRequiresAdmin(): void
    {
        self::assertSame(403, $this->get($this->appWith(new FakeUser(perms: ['projects:read'])), '/admin/projects')->getStatusCode());
    }

    public function testAdminCreateRequiresAdmin(): void
    {
        $res = $this->send($this->appWith(new FakeUser(perms: ['projects:read'])), 'POST', '/admin/projects', ['title' => 'X', 'customer_id' => 1]);
        self::assertSame(403, $res->getStatusCode());
    }

    public function testAdminCreateValidatesPayload(): void
    {
        $res = $this->send($this->appWith(new FakeUser(admin: true)), 'POST', '/admin/projects', ['title' => '']);
        self::assertSame(422, $res->getStatusCode());
    }

    public function testAdminMilestoneCreateRequiresTitle(): void
    {
        $res = $this->send($this->appWith(new FakeUser(admin: true)), 'POST', '/admin/projects/1/milestones', []);
        self::assertSame(422, $res->getStatusCode());
    }
}
