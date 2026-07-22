<?php
declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

/**
 * Projects + milestones (ported from tds-customer-api's `project`/`milestone`).
 * This extension owns its own DB: customer_id carries NO foreign key (the
 * customer entity lives in another domain — customer_id = the JWT active company
 * id). The milestone→project FK stays (same DB). MySQL-8-safe.
 *
 * Class name AND numeric prefix are extension-unique (shared phinxlog rule).
 */
final class CreateProjectsProject extends AbstractMigration
{
    public function change(): void
    {
        $this->table('projects_project', [
            'id' => true,
            'engine' => 'InnoDB',
            'collation' => 'utf8mb4_unicode_ci',
        ])
            ->addColumn('customer_id', 'integer', ['signed' => false])
            ->addColumn('title', 'string', ['limit' => 200])
            ->addColumn('status', 'enum', [
                'values' => ['discovery', 'in_progress', 'review', 'delivered', 'on_hold'],
                'default' => 'discovery',
            ])
            ->addColumn('start_date', 'date', ['null' => true])
            ->addColumn('target_date', 'date', ['null' => true])
            ->addColumn('description', 'text')
            ->addColumn('created_at', 'datetime', ['default' => 'CURRENT_TIMESTAMP'])
            ->addColumn('updated_at', 'datetime', ['default' => 'CURRENT_TIMESTAMP', 'update' => 'CURRENT_TIMESTAMP'])
            ->addIndex(['customer_id'], ['name' => 'idx_projects_customer'])
            ->create();

        $this->table('projects_milestone', [
            'id' => true,
            'engine' => 'InnoDB',
            'collation' => 'utf8mb4_unicode_ci',
        ])
            ->addColumn('project_id', 'integer', ['signed' => false])
            ->addColumn('title', 'string', ['limit' => 200])
            ->addColumn('status', 'enum', [
                'values' => ['pending', 'in_progress', 'completed'],
                'default' => 'pending',
            ])
            ->addColumn('due_date', 'date', ['null' => true])
            ->addColumn('completed_at', 'datetime', ['null' => true])
            ->addColumn('sort_order', 'integer', ['default' => 0])
            ->addIndex(['project_id'], ['name' => 'idx_projects_milestone_project'])
            ->addForeignKey('project_id', 'projects_project', 'id', ['delete' => 'CASCADE'])
            ->create();
    }
}
