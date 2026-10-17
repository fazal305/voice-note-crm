<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\DemoSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class TeamTest extends TestCase
{
    use RefreshDatabase;

    public function test_manager_lists_the_team_with_roles_and_status(): void
    {
        $manager = User::factory()->manager()->create(['name' => 'Alex']);
        User::factory()->create(['org_id' => $manager->org_id, 'name' => 'Bea']);

        $this->asUser($manager)->getJson('/api/team')
            ->assertOk()
            ->assertJsonPath('data.0.name', 'Alex')
            ->assertJsonPath('data.0.role', 'manager')
            ->assertJsonPath('data.0.is_you', true)
            ->assertJsonPath('data.1.name', 'Bea')
            ->assertJsonPath('data.1.active', true);
    }

    public function test_manager_creates_a_rep_who_can_sign_in(): void
    {
        $manager = User::factory()->manager()->create();

        $this->asUser($manager)->postJson('/api/team', [
            'name' => 'New Rep',
            'email' => 'New.Rep@example.com',
            'password' => 'temp-pass-123',
            'role' => 'manager',
        ])->assertCreated()->assertJsonPath('data.role', 'rep')->assertJsonMissingPath('data.password');

        $rep = User::firstWhere('email', 'new.rep@example.com');
        $this->assertSame($manager->org_id, $rep->org_id);
        $this->assertTrue(Hash::check('temp-pass-123', $rep->password));

        $this->app['auth']->forgetGuards();
        $this->postJson('/api/auth/login', ['email' => 'new.rep@example.com', 'password' => 'temp-pass-123'])->assertOk();
    }

    public function test_create_rep_validation(): void
    {
        $manager = User::factory()->manager()->create(['email' => 'taken@example.com']);

        $this->asUser($manager)->postJson('/api/team', [])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['name', 'email', 'password']);

        $this->postJson('/api/team', ['name' => 'X', 'email' => 'taken@example.com', 'password' => 'short'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['email', 'password']);
    }

    public function test_manager_updates_a_rep(): void
    {
        $manager = User::factory()->manager()->create();
        $rep = User::factory()->create(['org_id' => $manager->org_id]);

        $this->asUser($manager)->putJson("/api/team/{$rep->id}", ['name' => 'Renamed', 'email' => $rep->email])
            ->assertOk()
            ->assertJsonPath('data.name', 'Renamed');
    }

    public function test_manager_cannot_change_another_manager(): void
    {
        $manager = User::factory()->manager()->create();
        $peer = User::factory()->manager()->create(['org_id' => $manager->org_id]);

        $this->asUser($manager)->postJson("/api/team/{$peer->id}/deactivate")->assertForbidden();
        $this->postJson("/api/team/{$manager->id}/deactivate")->assertForbidden();
        $this->assertNull($peer->fresh()->deactivated_at);
    }

    public function test_deactivating_a_rep_revokes_access(): void
    {
        $manager = User::factory()->manager()->create();
        $rep = User::factory()->create(['org_id' => $manager->org_id, 'email' => 'rep@example.com', 'password' => 'secret-pass-1']);
        $token = $rep->createToken('spa')->plainTextToken;

        $this->asUser($manager)->postJson("/api/team/{$rep->id}/deactivate")->assertOk()->assertJsonPath('data.active', false);

        $this->app['auth']->forgetGuards();
        $this->withToken($token)->getJson('/api/me')->assertUnauthorized();
        $this->postJson('/api/auth/login', ['email' => 'rep@example.com', 'password' => 'secret-pass-1'])->assertUnprocessable();
    }

    public function test_team_changes_are_turned_off_in_the_demo(): void
    {
        $this->seed(DemoSeeder::class);
        $manager = User::firstWhere('email', 'manager@demo.invalid');
        $rep = User::firstWhere('email', 'rep@demo.invalid');

        $this->asUser($manager)->getJson('/api/team')->assertOk()->assertJsonCount(2, 'data');
        $this->postJson('/api/team', ['name' => 'X', 'email' => 'x@example.com', 'password' => 'temp-pass-123'])->assertForbidden();
        $this->postJson("/api/team/{$rep->id}/deactivate")->assertForbidden();
        $this->assertNull($rep->fresh()->deactivated_at);
    }
}
