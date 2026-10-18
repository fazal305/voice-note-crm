<?php

namespace Tests\Feature;

use App\Enums\VoiceNoteStatus;
use App\Models\Client;
use App\Models\Organization;
use App\Models\User;
use App\Models\VoiceNote;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\MakesCallHistory;
use Tests\TestCase;

class DashboardTest extends TestCase
{
    use MakesCallHistory, RefreshDatabase;

    private User $manager;

    private User $alice;

    private User $bob;

    private Client $calm;

    private Client $upset;

    private VoiceNote $failed;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo('2026-10-14 10:00:00');
    }

    /**
     * Wednesday 14 October 2026. The 7-day range starts on the 8th, the 30-day range on 15 September.
     * Alice: a call on 1 Oct (Frustrated) and 9 Oct (Positive) with Calm Co, a note still uploading on the 10th.
     * Bob: a Frustrated call with Upset Ltd on the 11th, a failed note and one awaiting a transcript.
     */
    private function seedOrganization(): void
    {
        $this->manager = User::factory()->manager()->create(['name' => 'Morgan']);
        $org = $this->manager->org_id;
        $this->alice = User::factory()->create(['org_id' => $org, 'name' => 'Alice', 'email' => 'alice@example.com']);
        $this->bob = User::factory()->create(['org_id' => $org, 'name' => 'Bob']);
        User::factory()->deactivated()->create(['org_id' => $org, 'name' => 'Cleo (left)']);
        $this->calm = Client::factory()->create(['org_id' => $org, 'name' => 'Calm Co']);
        $this->upset = Client::factory()->create(['org_id' => $org, 'name' => 'Upset Ltd']);

        $this->travelTo('2026-10-01 09:00:00');
        $this->callLog($this->alice, $this->calm, ['sentiment' => 'Frustrated']);
        $this->travelTo('2026-10-09 09:00:00');
        $this->callLog($this->alice, $this->calm, ['sentiment' => 'Positive']);
        $this->travelTo('2026-10-10 09:00:00');
        $this->voiceNote($this->alice, ['status' => VoiceNoteStatus::Uploaded]);
        $this->travelTo('2026-10-11 09:00:00');
        $this->callLog($this->bob, $this->upset, ['sentiment' => 'Frustrated']);
        $this->failed = $this->voiceNote($this->bob, ['status' => VoiceNoteStatus::Failed]);
        $this->voiceNote($this->bob, ['status' => VoiceNoteStatus::AwaitingTranscript]);
        $this->travelTo('2026-10-14 10:00:00');

        $this->taskFor($this->alice, ['due_at' => '2026-10-10']);
        $this->taskFor($this->alice, ['due_at' => '2026-10-20']);
        $this->taskFor($this->alice, ['due_at' => '2026-10-01', 'done_at' => now()]);
        $this->taskFor($this->bob);

        // Another organization's activity never shows.
        $stranger = User::factory()->create();
        $this->callLog($stranger, Client::factory()->create(['org_id' => $stranger->org_id]), ['sentiment' => 'Frustrated']);
        $this->voiceNote($stranger, ['status' => VoiceNoteStatus::Failed]);
        $this->taskFor($stranger, ['due_at' => '2026-10-01']);
    }

    public function test_dashboard_numbers_for_the_last_7_days(): void
    {
        $this->seedOrganization();

        $response = $this->asUser($this->manager)->getJson('/api/dashboard?range=7')->assertOk();

        $response
            ->assertJsonPath('range', 7)
            ->assertJsonPath('since', '2026-10-08')
            ->assertJsonPath('totals', ['notes' => 5, 'logs' => 2, 'overdue_tasks' => 1, 'failed_notes' => 1])
            ->assertJsonPath('people', [
                ['id' => $this->alice->id, 'name' => 'Alice', 'role' => 'rep', 'active' => true, 'notes' => 2, 'logs' => 1, 'overdue_tasks' => 1],
                ['id' => $this->bob->id, 'name' => 'Bob', 'role' => 'rep', 'active' => true, 'notes' => 3, 'logs' => 1, 'overdue_tasks' => 0],
                ['id' => $this->manager->id, 'name' => 'Morgan', 'role' => 'manager', 'active' => true, 'notes' => 0, 'logs' => 0, 'overdue_tasks' => 0],
            ])
            ->assertJsonPath('sentiment', ['Positive' => 1, 'Neutral' => 0, 'Frustrated' => 1])
            ->assertJsonPath('processing', ['uploaded' => 1, 'transcribing' => 0, 'awaiting_transcript' => 1, 'parsing' => 0, 'ready' => 2, 'failed' => 1])
            ->assertJsonPath('frustrated_clients', [['id' => $this->upset->id, 'name' => 'Upset Ltd', 'last_contact_at' => '2026-10-11T09:00:00+00:00']])
            ->assertJsonPath('failed_notes', [['id' => $this->failed->id, 'owner' => 'Bob', 'created_at' => '2026-10-11T09:00:00+00:00']]);

        // Names and numbers only.
        $this->assertStringNotContainsString('alice@example.com', $response->getContent());
        $this->assertStringNotContainsString('A call.', $response->getContent());
    }

    public function test_a_longer_range_counts_older_activity(): void
    {
        $this->seedOrganization();

        $this->asUser($this->manager)->getJson('/api/dashboard?range=30')
            ->assertOk()
            ->assertJsonPath('since', '2026-09-15')
            ->assertJsonPath('totals.notes', 6)
            ->assertJsonPath('totals.logs', 3)
            ->assertJsonPath('people.0.notes', 3)
            ->assertJsonPath('people.0.logs', 2)
            ->assertJsonPath('sentiment', ['Positive' => 1, 'Neutral' => 0, 'Frustrated' => 2])
            // Calm Co's earlier frustration was followed by a positive call, so it isn't flagged.
            ->assertJsonCount(1, 'frustrated_clients');
    }

    public function test_dashboard_is_for_managers_only(): void
    {
        $rep = User::factory()->create();

        $this->asUser($rep)->getJson('/api/dashboard')->assertForbidden()->assertJsonPath('message', 'This area is for managers only.');
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/dashboard')->assertUnauthorized();
    }

    public function test_range_is_validated_and_defaults_to_30_days(): void
    {
        $manager = User::factory()->manager()->create();
        $this->asUser($manager);

        $this->getJson('/api/dashboard?range=14')->assertUnprocessable()->assertJsonValidationErrors('range');
        $this->getJson('/api/dashboard')->assertOk()->assertJsonPath('range', 30);
    }

    public function test_a_new_organization_gets_zeros(): void
    {
        $manager = User::factory()->manager()->create(['name' => 'Solo']);

        $this->asUser($manager)->getJson('/api/dashboard?range=90')
            ->assertOk()
            ->assertJsonPath('totals', ['notes' => 0, 'logs' => 0, 'overdue_tasks' => 0, 'failed_notes' => 0])
            ->assertJsonPath('people.0.name', 'Solo')
            ->assertJsonPath('sentiment', ['Positive' => 0, 'Neutral' => 0, 'Frustrated' => 0])
            ->assertJsonPath('frustrated_clients', [])
            ->assertJsonPath('failed_notes', []);
    }

    public function test_dashboard_query_count_does_not_grow_with_rows(): void
    {
        $this->seedOrganization();
        $this->asUser($this->manager);
        $dashboard = fn () => $this->getJson('/api/dashboard?range=30')->assertOk();
        $few = $this->countQueries($dashboard);

        foreach (User::factory()->count(5)->create(['org_id' => $this->manager->org_id]) as $rep) {
            foreach (range(1, 3) as $i) {
                $client = Client::factory()->create(['org_id' => $rep->org_id]);
                $this->callLog($rep, $client, ['sentiment' => 'Frustrated']);
                $this->voiceNote($rep, ['status' => VoiceNoteStatus::Failed]);
                $this->taskFor($rep, ['due_at' => '2026-10-01']);
            }
        }
        $many = $this->countQueries($dashboard);

        $this->assertSame($few, $many);
        $this->assertLessThanOrEqual(8, $many);
    }

    public function test_rep_summary_counts_their_own_week_tasks_and_follow_ups(): void
    {
        $rep = User::factory()->create();
        $teammate = User::factory()->create(['org_id' => $rep->org_id]);
        $client = Client::factory()->create(['org_id' => $rep->org_id, 'name' => 'Juniper']);

        // The week started on Monday the 12th.
        $this->travelTo('2026-10-11 18:00:00');
        $this->voiceNote($rep);
        $this->callLog($rep, $client, ['follow_up_at' => '2026-10-13']);
        $this->travelTo('2026-10-12 09:00:00');
        $this->voiceNote($rep);
        foreach (['2026-10-30', '2026-10-15', '2026-10-14', '2026-10-21', '2026-10-28', '2026-10-17'] as $date) {
            $this->callLog($rep, $client, ['follow_up_at' => $date, 'follow_up_phrase' => "on {$date}"]);
        }
        $this->callLog($teammate, $client, ['follow_up_at' => '2026-10-14']);
        $this->voiceNote($teammate);
        $this->travelTo('2026-10-14 10:00:00');
        $this->taskFor($rep, ['due_at' => '2026-10-13']);
        $this->taskFor($rep, ['due_at' => '2026-10-14']);
        $this->taskFor($rep);
        $this->taskFor($rep, ['due_at' => '2026-10-01', 'done_at' => now()]);
        $this->taskFor($teammate, ['due_at' => '2026-10-01']);

        $this->asUser($rep)->getJson('/api/me/summary')
            ->assertOk()
            ->assertJsonPath('week_start', '2026-10-12')
            // One plain note plus the six logged calls' notes, all on the 12th.
            ->assertJsonPath('notes_this_week', 7)
            ->assertJsonPath('open_tasks', 3)
            ->assertJsonPath('overdue_tasks', 1)
            ->assertJsonCount(5, 'next_follow_ups')
            ->assertJsonPath('next_follow_ups.0', ['date' => '2026-10-14', 'phrase' => 'on 2026-10-14', 'client' => ['id' => $client->id, 'name' => 'Juniper']])
            ->assertJsonPath('next_follow_ups.4.date', '2026-10-28');
    }

    public function test_demo_organization_dashboard_works_for_its_manager(): void
    {
        $org = new Organization(['name' => 'Demo']);
        $org->forceFill(['is_demo' => true])->save();
        $manager = User::factory()->manager()->create(['org_id' => $org->id]);

        $this->asUser($manager)->getJson('/api/dashboard?range=7')->assertOk();
    }
}
