<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class AuthorizationTest extends TestCase
{
    use RefreshDatabase;

    public static function managerRoutes(): array
    {
        return [
            'list team' => ['get', '/api/team'],
            'create rep' => ['post', '/api/team'],
            'update rep' => ['put', '/api/team/{rep}'],
            'deactivate rep' => ['post', '/api/team/{rep}/deactivate'],
        ];
    }

    #[DataProvider('managerRoutes')]
    public function test_rep_cannot_reach_manager_routes(string $method, string $uri): void
    {
        $rep = User::factory()->create();
        $other = User::factory()->create(['org_id' => $rep->org_id, 'name' => 'Unchanged']);
        $uri = str_replace('{rep}', (string) $other->id, $uri);

        $this->asUser($rep)->json($method, $uri, ['name' => 'Changed', 'email' => 'new@example.com', 'password' => 'temp-pass-123'])
            ->assertForbidden()
            ->assertJsonPath('message', 'This area is for managers only.');

        $this->assertSame('Unchanged', $other->fresh()->name);
        $this->assertNull($other->fresh()->deactivated_at);
        $this->assertSame(2, User::count());
    }

    public static function crossOrgClientRequests(): array
    {
        return [
            'show' => ['get'],
            'update' => ['put'],
            'delete' => ['delete'],
        ];
    }

    #[DataProvider('crossOrgClientRequests')]
    public function test_clients_of_another_organization_answer_404(string $method): void
    {
        $manager = User::factory()->manager()->create();
        $foreign = Client::factory()->create(['name' => 'Foreign']);

        $this->asUser($manager)->json($method, "/api/clients/{$foreign->id}", ['name' => 'Hijacked'])
            ->assertNotFound()
            ->assertExactJson(['message' => 'Not Found.']);

        $this->assertSame('Foreign', $foreign->fresh()->name);
    }

    public function test_missing_and_foreign_clients_are_indistinguishable(): void
    {
        $rep = User::factory()->create();
        $foreign = Client::factory()->create();

        $missing = $this->asUser($rep)->getJson('/api/clients/999999')->assertNotFound()->json();
        $other = $this->getJson("/api/clients/{$foreign->id}")->assertNotFound()->json();

        $this->assertSame($missing, $other);
    }

    public function test_cross_org_update_is_404_even_with_invalid_input(): void
    {
        $rep = User::factory()->create();
        $foreign = Client::factory()->create();

        $this->asUser($rep)->putJson("/api/clients/{$foreign->id}", [])->assertNotFound();
    }

    public function test_manager_cannot_touch_users_of_another_organization(): void
    {
        $manager = User::factory()->manager()->create();
        $foreignRep = User::factory()->create(['name' => 'Foreign rep']);

        $this->asUser($manager)->putJson("/api/team/{$foreignRep->id}", ['name' => 'Changed', 'email' => 'x@example.com'])->assertNotFound();
        $this->postJson("/api/team/{$foreignRep->id}/deactivate")->assertNotFound();

        $this->assertSame('Foreign rep', $foreignRep->fresh()->name);
        $this->assertNull($foreignRep->fresh()->deactivated_at);
    }

    public function test_team_list_is_scoped_to_the_managers_organization(): void
    {
        $manager = User::factory()->manager()->create();
        User::factory()->create(['org_id' => $manager->org_id]);
        User::factory()->create();

        $this->asUser($manager)->getJson('/api/team')->assertOk()->assertJsonCount(2, 'data');
    }
}
