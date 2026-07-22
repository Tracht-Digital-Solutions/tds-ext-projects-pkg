<?php
declare(strict_types=1);

namespace Tds\Ext\Projects\Domain;

use PDO;

/**
 * Data access for projects + milestones. Ported from tds-customer-api's Project
 * actions. `customer_id` is the JWT active company id (no FK). Customer reads are
 * company-scoped; admin manages any project.
 */
final class ProjectRepository
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    private const P_COLS = 'id, customer_id, title, status, start_date, target_date, description, created_at, updated_at';
    private const M_COLS = 'id, project_id, title, status, due_date, completed_at, sort_order';
    private const STATUSES = ['discovery', 'in_progress', 'review', 'delivered', 'on_hold'];
    private const M_STATUSES = ['pending', 'in_progress', 'completed'];

    /** @return array<int,array<string,mixed>> */
    public function listForCustomer(int $customerId): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT ' . self::P_COLS . ' FROM projects_project WHERE customer_id = :cid ORDER BY id DESC'
        );
        $stmt->execute(['cid' => $customerId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    /** @return array<string,mixed>|null */
    public function getForCustomer(int $id, int $customerId): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT ' . self::P_COLS . ' FROM projects_project WHERE id = :id AND customer_id = :cid LIMIT 1'
        );
        $stmt->execute(['id' => $id, 'cid' => $customerId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row === false ? null : $row;
    }

    /** @return array<string,mixed>|null (admin: any company) */
    public function getAdmin(int $id): ?array
    {
        $stmt = $this->pdo->prepare('SELECT ' . self::P_COLS . ' FROM projects_project WHERE id = :id LIMIT 1');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row === false ? null : $row;
    }

    /** @return array<int,array<string,mixed>> */
    public function milestonesFor(int $projectId): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT ' . self::M_COLS . ' FROM projects_milestone WHERE project_id = :pid ORDER BY sort_order ASC, id ASC'
        );
        $stmt->execute(['pid' => $projectId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    /** Active projects (not delivered) for the widget; null customerId = all (admin). */
    public function activeCount(?int $customerId): int
    {
        $sql = "SELECT COUNT(*) FROM projects_project WHERE status <> 'delivered'";
        $params = [];
        if ($customerId !== null) {
            $sql .= ' AND customer_id = :cid';
            $params['cid'] = $customerId;
        }
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        return (int) $stmt->fetchColumn();
    }

    /** @return array<int,array<string,mixed>> Admin: all projects + milestone summary (no customer join). */
    public function listAllAdmin(): array
    {
        $stmt = $this->pdo->query(
            'SELECT id, customer_id, title, status, start_date, target_date FROM projects_project ORDER BY id DESC LIMIT 500'
        );
        $projects = $stmt === false ? [] : $stmt->fetchAll(PDO::FETCH_ASSOC);
        if ($projects === []) {
            return [];
        }
        $ids = array_map(static fn ($p) => (int) $p['id'], $projects);
        $ph = implode(',', array_fill(0, count($ids), '?'));
        $ms = $this->pdo->prepare(
            "SELECT " . self::M_COLS . " FROM projects_milestone WHERE project_id IN ($ph) ORDER BY sort_order ASC, id ASC"
        );
        $ms->execute($ids);
        $byProject = [];
        foreach ($ms->fetchAll(PDO::FETCH_ASSOC) as $m) {
            $byProject[(int) $m['project_id']][] = $m;
        }
        foreach ($projects as &$p) {
            $p['milestones'] = $byProject[(int) $p['id']] ?? [];
        }
        unset($p);
        return $projects;
    }

    /** @param array<string,mixed> $d */
    public function create(int $customerId, array $d): int
    {
        $stmt = $this->pdo->prepare(
            'INSERT INTO projects_project (customer_id, title, status, start_date, target_date, description, created_at, updated_at) '
            . 'VALUES (:cid, :title, :status, :start, :target, :desc, NOW(), NOW())'
        );
        $stmt->execute([
            'cid' => $customerId,
            'title' => (string) $d['title'],
            'status' => self::normStatus($d['status'] ?? 'discovery'),
            'start' => self::nullDate($d['start_date'] ?? null),
            'target' => self::nullDate($d['target_date'] ?? null),
            'desc' => (string) ($d['description'] ?? ''),
        ]);
        return (int) $this->pdo->lastInsertId();
    }

    /** @param array<string,mixed> $d */
    public function update(int $id, array $d): bool
    {
        $stmt = $this->pdo->prepare(
            'UPDATE projects_project SET title = :title, status = :status, start_date = :start, '
            . 'target_date = :target, description = :desc, updated_at = NOW() WHERE id = :id'
        );
        $stmt->execute([
            'id' => $id,
            'title' => (string) $d['title'],
            'status' => self::normStatus($d['status'] ?? 'discovery'),
            'start' => self::nullDate($d['start_date'] ?? null),
            'target' => self::nullDate($d['target_date'] ?? null),
            'desc' => (string) ($d['description'] ?? ''),
        ]);
        return $stmt->rowCount() >= 0;
    }

    public function delete(int $id): bool
    {
        $stmt = $this->pdo->prepare('DELETE FROM projects_project WHERE id = :id');
        $stmt->execute(['id' => $id]);
        return $stmt->rowCount() > 0;
    }

    /** @param array<string,mixed> $d */
    public function createMilestone(int $projectId, array $d): int
    {
        $stmt = $this->pdo->prepare(
            'INSERT INTO projects_milestone (project_id, title, status, due_date, sort_order) '
            . 'VALUES (:pid, :title, :status, :due, :sort)'
        );
        $stmt->execute([
            'pid' => $projectId,
            'title' => (string) $d['title'],
            'status' => self::normMilestoneStatus($d['status'] ?? 'pending'),
            'due' => self::nullDate($d['due_date'] ?? null),
            'sort' => (int) ($d['sort_order'] ?? 0),
        ]);
        return (int) $this->pdo->lastInsertId();
    }

    /** @param array<string,mixed> $d */
    public function updateMilestone(int $id, array $d): bool
    {
        $status = self::normMilestoneStatus($d['status'] ?? 'pending');
        $completed = $status === 'completed' ? 'NOW()' : 'NULL';
        $stmt = $this->pdo->prepare(
            "UPDATE projects_milestone SET title = :title, status = :status, due_date = :due, "
            . "sort_order = :sort, completed_at = $completed WHERE id = :id"
        );
        $stmt->execute([
            'id' => $id,
            'title' => (string) $d['title'],
            'status' => $status,
            'due' => self::nullDate($d['due_date'] ?? null),
            'sort' => (int) ($d['sort_order'] ?? 0),
        ]);
        return $stmt->rowCount() >= 0;
    }

    public function deleteMilestone(int $id): bool
    {
        $stmt = $this->pdo->prepare('DELETE FROM projects_milestone WHERE id = :id');
        $stmt->execute(['id' => $id]);
        return $stmt->rowCount() > 0;
    }

    private static function normStatus(mixed $s): string
    {
        $s = (string) $s;
        return in_array($s, self::STATUSES, true) ? $s : 'discovery';
    }

    private static function normMilestoneStatus(mixed $s): string
    {
        $s = (string) $s;
        return in_array($s, self::M_STATUSES, true) ? $s : 'pending';
    }

    private static function nullDate(mixed $v): ?string
    {
        $v = trim((string) ($v ?? ''));
        return $v === '' ? null : $v;
    }
}
