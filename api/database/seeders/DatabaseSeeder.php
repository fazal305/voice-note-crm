<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /** Real organizations start empty; only the labelled demo organization gets sample data. */
    public function run(): void
    {
        $this->call(DemoSeeder::class);
    }
}
