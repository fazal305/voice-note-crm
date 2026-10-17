<?php

namespace App\Console\Commands;

use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

#[Signature('db:enable-rls')]
#[Description('PostgreSQL only: switch on row level security for every table in the app schema')]
class EnableRowLevelSecurity extends Command
{
    /**
     * The app's own role owns these tables, so it is not affected. With no policies, RLS denies every
     * other role (such as a hosted Postgres provider's API roles) even if it is later granted access.
     */
    public function handle(): int
    {
        if (DB::getDriverName() !== 'pgsql') {
            $this->info('Not a PostgreSQL connection; nothing to do.');

            return self::SUCCESS;
        }

        $tables = DB::select(
            "SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = current_schema() AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity"
        );

        foreach ($tables as $table) {
            DB::statement('ALTER TABLE '.DB::getQueryGrammar()->wrapTable($table->relname).' ENABLE ROW LEVEL SECURITY');
        }

        $this->info('Row level security enabled on '.count($tables).' table(s).');

        return self::SUCCESS;
    }
}
