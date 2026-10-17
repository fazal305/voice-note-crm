<?php

namespace Database\Seeders;

use App\Enums\UserRole;
use App\Models\Organization;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * The shared demo organization behind POST /api/demo/login. Every name and company is made up.
 * The demo accounts get random passwords that are never stored or shown: the demo endpoint signs in without one.
 */
class DemoSeeder extends Seeder
{
    public const ORG_NAME = 'Demo — sample data';

    private const CLIENTS = [
        ['name' => 'Juniper Hollowell', 'company' => 'Example Lantern Works', 'email' => 'juniper@lantern.example', 'phone' => '+1 555 0101', 'notes' => 'Prefers calls after 2pm.'],
        ['name' => 'Otis Brambleby', 'company' => 'Sample Kettle & Co.', 'email' => 'otis@kettle.example', 'phone' => '+1 555 0102', 'notes' => null],
        ['name' => 'Marisol Quillfeather', 'company' => 'Placeholder Paper Mill', 'email' => 'marisol@papermill.example', 'phone' => null, 'notes' => 'Asked for a quote on 200 units.'],
        ['name' => 'Bertram Fizzwick', 'company' => 'Fictional Bicycle Supply', 'email' => null, 'phone' => '+1 555 0104', 'notes' => null],
        ['name' => 'Wren Applethorn', 'company' => 'Pretend Orchard Foods', 'email' => 'wren@orchard.example', 'phone' => '+1 555 0105', 'notes' => 'Renewal due next quarter.'],
        ['name' => 'Cosmo Pebblesworth', 'company' => null, 'email' => 'cosmo@pebble.example', 'phone' => null, 'notes' => 'Independent buyer.'],
    ];

    public function run(): void
    {
        DB::transaction(function () {
            $org = Organization::where('is_demo', true)->first();
            if (! $org) {
                $org = new Organization(['name' => self::ORG_NAME]);
                $org->forceFill(['is_demo' => true])->save();
                $org->settings()->create();
            }

            $this->account($org, UserRole::Manager, 'Demo Manager', 'manager@demo.invalid');
            $this->account($org, UserRole::Rep, 'Demo Rep', 'rep@demo.invalid');

            if (! $org->clients()->exists()) {
                foreach (self::CLIENTS as $client) {
                    $org->clients()->create($client);
                }
            }
        });
    }

    private function account(Organization $org, UserRole $role, string $name, string $email): void
    {
        if (User::where('email', $email)->exists()) {
            return;
        }

        $user = new User(['name' => $name, 'email' => $email, 'password' => Str::random(40)]);
        $user->forceFill(['org_id' => $org->id, 'role' => $role, 'terms_accepted_at' => now()])->save();
    }
}
