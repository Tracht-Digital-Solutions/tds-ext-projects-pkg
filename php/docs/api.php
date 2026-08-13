<?php
/**
 * API documentation for this module's routes — consumed through `ApiDocSource`
 * and rendered in the admin frontend's API reference (`GET /wiki.json`).
 *
 * `pattern` must match the Slim pattern in `register()` VERBATIM, inline regex
 * included: it is the join key for the route introspection.
 * `php/tests/ProjectsApiDocsTest.php` fails the build if the documented set and
 * the registered set drift apart in either direction.
 */

declare(strict_types=1);

$projectFields = [
    ['in' => 'body', 'name' => 'title', 'type' => 'string', 'required' => true, 'description' => 'Projekttitel, darf nicht leer sein.'],
    ['in' => 'body', 'name' => 'status', 'type' => 'string', 'description' => 'Projektstatus.'],
    ['in' => 'body', 'name' => 'start_date', 'type' => 'date', 'description' => 'Startdatum, `YYYY-MM-DD`.'],
    ['in' => 'body', 'name' => 'target_date', 'type' => 'date', 'description' => 'Zieldatum, `YYYY-MM-DD`.'],
    ['in' => 'body', 'name' => 'description', 'type' => 'string', 'description' => 'Beschreibung.'],
];

$milestoneFields = [
    ['in' => 'body', 'name' => 'title', 'type' => 'string', 'required' => true, 'description' => 'Titel des Meilensteins, darf nicht leer sein.'],
    ['in' => 'body', 'name' => 'status', 'type' => 'string', 'description' => 'Status des Meilensteins.'],
    ['in' => 'body', 'name' => 'due_date', 'type' => 'date', 'description' => 'Fälligkeit, `YYYY-MM-DD`.'],
    ['in' => 'body', 'name' => 'sort_order', 'type' => 'int', 'description' => 'Position in der Liste.'],
];

return [
    [
        'method' => 'GET',
        'pattern' => '/projects/summary',
        'tag' => 'Portal',
        'summary' => 'Anzahl aktiver Projekte der aktiven Firma',
        'description' => 'Die `dataEndpoint`-Route des Dashboard-Widgets.',
        'permission' => 'projects:read',
        'responses' => [
            ['status' => 200, 'description' => '`{active: <Anzahl>}`'],
            ['status' => 401, 'description' => 'Keine Sitzung.'],
            ['status' => 403, 'description' => 'Kein `projects:read`.'],
        ],
    ],
    [
        'method' => 'GET',
        'pattern' => '/projects',
        'tag' => 'Portal',
        'summary' => 'Projekte der aktiven Firma',
        'description' => 'Ohne aktive Firma (`X-Act-As-Customer`) eine leere Liste, kein '
            . 'Fehler — das ist der normale Zustand eines Admins ohne Firmenauswahl.',
        'permission' => 'projects:read',
        'responses' => [
            ['status' => 200, 'description' => '`{projects: [{id, title, status, start_date, target_date, …}]}`'],
            ['status' => 401, 'description' => 'Keine Sitzung.'],
            ['status' => 403, 'description' => 'Kein `projects:read`.'],
        ],
    ],
    [
        'method' => 'GET',
        'pattern' => '/projects/{id:[0-9]+}',
        'tag' => 'Portal',
        'summary' => 'Ein Projekt samt Meilensteinen',
        'description' => 'Ein Admin **ohne** aktive Firma sieht jedes Projekt; sonst wird auf '
            . 'die aktive Firma eingeschränkt. Ein fremdes Projekt ergibt 404, nicht 403.',
        'permission' => 'projects:read',
        'params' => [
            ['in' => 'path', 'name' => 'id', 'type' => 'int', 'required' => true, 'description' => 'Id des Projekts.'],
        ],
        'responses' => [
            ['status' => 200, 'description' => '`{project, milestones: [...]}`'],
            ['status' => 401, 'description' => 'Keine Sitzung.'],
            ['status' => 403, 'description' => 'Kein `projects:read`.'],
            ['status' => 404, 'description' => 'Unbekannt oder nicht in der aktiven Firma.'],
        ],
    ],
    [
        'method' => 'GET',
        'pattern' => '/admin/projects',
        'tag' => 'Verwaltung',
        'summary' => 'Alle Projekte über alle Firmen',
        'auth' => 'admin',
        'responses' => [
            ['status' => 200, 'description' => '`{projects: [...]}` inklusive Firmenzuordnung.'],
            ['status' => 401, 'description' => 'Keine Sitzung.'],
            ['status' => 403, 'description' => 'Angemeldet, aber kein Admin.'],
        ],
    ],
    [
        'method' => 'POST',
        'pattern' => '/admin/projects',
        'tag' => 'Verwaltung',
        'summary' => 'Projekt anlegen',
        'auth' => 'admin',
        'params' => array_merge(
            [['in' => 'body', 'name' => 'customer_id', 'type' => 'int', 'required' => true, 'description' => 'Firma, der das Projekt gehört.']],
            $projectFields,
        ),
        'responses' => [
            ['status' => 201, 'description' => '`{id}` des angelegten Projekts.'],
            ['status' => 401, 'description' => 'Keine Sitzung.'],
            ['status' => 403, 'description' => 'Angemeldet, aber kein Admin.'],
            ['status' => 422, 'description' => '`title` leer oder `customer_id` fehlt.'],
        ],
    ],
    [
        'method' => 'PATCH',
        'pattern' => '/admin/projects/{id:[0-9]+}',
        'tag' => 'Verwaltung',
        'summary' => 'Projekt ändern',
        'description' => 'Schreibt alle Felder — nicht gesendete werden geleert, nicht '
            . 'beibehalten. Die Firmenzuordnung bleibt unverändert.',
        'auth' => 'admin',
        'params' => array_merge(
            [['in' => 'path', 'name' => 'id', 'type' => 'int', 'required' => true, 'description' => 'Id des Projekts.']],
            $projectFields,
        ),
        'responses' => [
            ['status' => 200, 'description' => '`{id}`'],
            ['status' => 401, 'description' => 'Keine Sitzung.'],
            ['status' => 403, 'description' => 'Angemeldet, aber kein Admin.'],
            ['status' => 422, 'description' => '`title` fehlt oder ist leer.'],
        ],
    ],
    [
        'method' => 'DELETE',
        'pattern' => '/admin/projects/{id:[0-9]+}',
        'tag' => 'Verwaltung',
        'summary' => 'Projekt löschen',
        'description' => 'Löscht die Meilensteine mit.',
        'auth' => 'admin',
        'params' => [
            ['in' => 'path', 'name' => 'id', 'type' => 'int', 'required' => true, 'description' => 'Id des Projekts.'],
        ],
        'responses' => [
            ['status' => 200, 'description' => '`{deleted: true}`'],
            ['status' => 401, 'description' => 'Keine Sitzung.'],
            ['status' => 403, 'description' => 'Angemeldet, aber kein Admin.'],
            ['status' => 404, 'description' => 'Unbekannte Id.'],
        ],
    ],
    [
        'method' => 'POST',
        'pattern' => '/admin/projects/{id:[0-9]+}/milestones',
        'tag' => 'Verwaltung',
        'summary' => 'Meilenstein zu einem Projekt anlegen',
        'auth' => 'admin',
        'params' => array_merge(
            [['in' => 'path', 'name' => 'id', 'type' => 'int', 'required' => true, 'description' => 'Id des Projekts.']],
            $milestoneFields,
        ),
        'responses' => [
            ['status' => 201, 'description' => '`{id}` des Meilensteins.'],
            ['status' => 401, 'description' => 'Keine Sitzung.'],
            ['status' => 403, 'description' => 'Angemeldet, aber kein Admin.'],
            ['status' => 422, 'description' => '`title` fehlt oder ist leer.'],
        ],
    ],
    [
        'method' => 'PATCH',
        'pattern' => '/admin/milestones/{id:[0-9]+}',
        'tag' => 'Verwaltung',
        'summary' => 'Meilenstein ändern',
        'description' => 'Liegt unter `/admin/milestones`, nicht unter dem Projekt: die '
            . 'Meilenstein-Id ist global eindeutig, und die Oberfläche bearbeitet ihn '
            . 'aus der Liste heraus, ohne das Projekt mitzuführen.',
        'auth' => 'admin',
        'params' => array_merge(
            [['in' => 'path', 'name' => 'id', 'type' => 'int', 'required' => true, 'description' => 'Id des Meilensteins.']],
            $milestoneFields,
        ),
        'responses' => [
            ['status' => 200, 'description' => '`{id}`'],
            ['status' => 401, 'description' => 'Keine Sitzung.'],
            ['status' => 403, 'description' => 'Angemeldet, aber kein Admin.'],
            ['status' => 422, 'description' => '`title` fehlt oder ist leer.'],
        ],
    ],
    [
        'method' => 'DELETE',
        'pattern' => '/admin/milestones/{id:[0-9]+}',
        'tag' => 'Verwaltung',
        'summary' => 'Meilenstein löschen',
        'auth' => 'admin',
        'params' => [
            ['in' => 'path', 'name' => 'id', 'type' => 'int', 'required' => true, 'description' => 'Id des Meilensteins.'],
        ],
        'responses' => [
            ['status' => 200, 'description' => '`{deleted: true}`'],
            ['status' => 401, 'description' => 'Keine Sitzung.'],
            ['status' => 403, 'description' => 'Angemeldet, aber kein Admin.'],
            ['status' => 404, 'description' => 'Unbekannte Id.'],
        ],
    ],
];
