<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\Organization;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ClientsTest extends TestCase
{
    use RefreshDatabase;

    public function test_clients_require_authentication(): void
    {
        $this->getJson('/api/clients')->assertUnauthorized();
        $this->postJson('/api/clients', ['name' => 'X'])->assertUnauthorized();
    }

    public function test_list_returns_only_the_users_organization_sorted_by_name(): void
    {
        $rep = User::factory()->create();
        Client::factory()->create(['org_id' => $rep->org_id, 'name' => 'Zed']);
        Client::factory()->create(['org_id' => $rep->org_id, 'name' => 'Amy']);
        Client::factory()->create(['name' => 'Other org client']);

        $this->asUser($rep)->getJson('/api/clients')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.name', 'Amy')
            ->assertJsonPath('data.1.name', 'Zed')
            ->assertJsonMissingPath('data.0.org_id');
    }

    public function test_list_searches_name_and_company(): void
    {
        $rep = User::factory()->create();
        Client::factory()->create(['org_id' => $rep->org_id, 'name' => 'Amy Pond', 'company' => 'Leadworth']);
        Client::factory()->create(['org_id' => $rep->org_id, 'name' => 'Rory', 'company' => 'Pond Supplies']);
        Client::factory()->create(['org_id' => $rep->org_id, 'name' => 'Clara', 'company' => 'Coal Hill']);

        $this->asUser($rep)->getJson('/api/clients?search=pond')->assertOk()->assertJsonCount(2, 'data');
        $this->getJson('/api/clients?search=nobody')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson('/api/clients?search=%25')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_rep_can_create_and_update_a_client_in_their_organization(): void
    {
        $rep = User::factory()->create();

        $id = $this->asUser($rep)->postJson('/api/clients', [
            'name' => 'Amy Pond',
            'company' => 'Leadworth',
            'email' => 'amy@example.com',
            'phone' => '+44 (0) 20-7946.0000',
            'org_id' => Organization::factory()->create()->id,
        ])->assertCreated()->assertJsonPath('data.name', 'Amy Pond')->json('data.id');

        $this->assertSame($rep->org_id, Client::find($id)->org_id);

        $this->putJson("/api/clients/{$id}", ['name' => 'Amelia Pond', 'notes' => 'Prefers email.'])
            ->assertOk()
            ->assertJsonPath('data.name', 'Amelia Pond')
            ->assertJsonPath('data.company', null)
            ->assertJsonPath('data.notes', 'Prefers email.');

        $this->getJson("/api/clients/{$id}")->assertOk()->assertJsonPath('data.name', 'Amelia Pond');
    }

    public function test_client_validation(): void
    {
        $rep = User::factory()->create();

        $this->asUser($rep)->postJson('/api/clients', [])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['name']);

        $this->postJson('/api/clients', ['name' => str_repeat('a', 121), 'email' => 'nope', 'phone' => 'call me'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['name', 'email', 'phone']);
    }

    public function test_only_a_manager_can_delete_a_client(): void
    {
        $rep = User::factory()->create();
        $manager = User::factory()->manager()->create(['org_id' => $rep->org_id]);
        $client = Client::factory()->create(['org_id' => $rep->org_id]);

        $this->asUser($rep)->deleteJson("/api/clients/{$client->id}")->assertForbidden();
        $this->assertModelExists($client);

        $this->asUser($manager)->deleteJson("/api/clients/{$client->id}")->assertNoContent();
        $this->assertModelMissing($client);
    }
}
