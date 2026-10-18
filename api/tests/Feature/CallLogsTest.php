<?php

namespace Tests\Feature;

use App\Enums\VoiceNoteStatus;
use App\Jobs\ParseVoiceNote;
use App\Jobs\TranscribeVoiceNote;
use App\Models\CallLog;
use App\Models\Client;
use App\Models\Organization;
use App\Models\Task;
use App\Models\User;
use App\Models\VoiceNote;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class CallLogsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo('2026-10-14 10:00:00');
    }

    private function note(User $rep, array $attributes = []): VoiceNote
    {
        $note = new VoiceNote;
        $note->forceFill(array_merge([
            'org_id' => $rep->org_id,
            'user_id' => $rep->id,
            'status' => VoiceNoteStatus::Ready,
            'source' => 'upload',
            'storage_key' => 'org-'.$rep->org_id.'/'.bin2hex(random_bytes(8)).'.enc',
            'mime' => 'audio/wav',
            'size_bytes' => 100,
            'attempts' => 1,
            'transcript' => 'Spoke with Juniper about the pilot. I will send the quote by Friday.',
            'processing_started_at' => now(),
        ], $attributes))->save();

        return $note;
    }

    private function payload(Client $client, array $overrides = []): array
    {
        return array_merge([
            'client_id' => $client->id,
            'summary' => 'Juniper wants to expand the pilot to two more sites.',
            'sentiment' => 'Positive',
            'action_items' => [
                ['text' => 'Send the revised quote', 'owner' => 'rep', 'due_date' => '2026-10-16', 'include' => true],
                ['text' => 'Check the budget with finance', 'owner' => 'client', 'due_date' => null, 'include' => true],
                ['text' => 'Not worth tracking', 'owner' => 'rep', 'due_date' => null, 'include' => false],
            ],
            'follow_up' => ['date' => '2026-10-20', 'phrase' => 'next Tuesday'],
        ], $overrides);
    }

    public function test_saving_creates_the_log_and_its_tasks_and_attaches_the_client(): void
    {
        $rep = User::factory()->create();
        $client = Client::factory()->create(['org_id' => $rep->org_id, 'name' => 'Juniper Hollowell']);
        $note = $this->note($rep);

        $response = $this->asUser($rep)->postJson("/api/voice-notes/{$note->id}/call-log", $this->payload($client))
            ->assertCreated()
            ->assertJsonPath('data.voice_note_id', $note->id)
            ->assertJsonPath('data.client', ['id' => $client->id, 'name' => 'Juniper Hollowell'])
            ->assertJsonPath('data.summary', 'Juniper wants to expand the pilot to two more sites.')
            ->assertJsonPath('data.sentiment', 'Positive')
            ->assertJsonPath('data.follow_up', ['date' => '2026-10-20', 'phrase' => 'next Tuesday'])
            ->assertJsonPath('data.author.is_you', true)
            ->assertJsonCount(3, 'data.tasks');

        $tasks = $response->json('data.tasks');
        $this->assertSame(['Send the revised quote', '2026-10-16', 'rep'], [$tasks[0]['title'], $tasks[0]['due_date'], $tasks[0]['owner']]);
        // No date of its own: due on the follow-up day.
        $this->assertSame(['Check the budget with finance', '2026-10-20', 'client'], [$tasks[1]['title'], $tasks[1]['due_date'], $tasks[1]['owner']]);
        $this->assertSame(['Follow up with Juniper Hollowell', '2026-10-20', 'rep'], [$tasks[2]['title'], $tasks[2]['due_date'], $tasks[2]['owner']]);
        $this->assertNotContains('Not worth tracking', array_column($tasks, 'title'));
        $this->assertSame([$rep->id], Task::pluck('assignee_id')->unique()->values()->all());
        $this->assertSame([$client->id], Task::pluck('client_id')->unique()->values()->all());

        $this->assertSame($client->id, $note->fresh()->client_id);
        $this->getJson("/api/voice-notes/{$note->id}")
            ->assertJsonPath('data.client.id', $client->id)
            ->assertJsonPath('data.call_log.id', $response->json('data.id'))
            ->assertJsonCount(3, 'data.call_log.tasks');
    }

    public function test_the_follow_up_reminder_is_skipped_when_an_item_already_covers_it(): void
    {
        $rep = User::factory()->create();
        $client = Client::factory()->create(['org_id' => $rep->org_id]);
        $note = $this->note($rep);

        $this->asUser($rep)->postJson("/api/voice-notes/{$note->id}/call-log", $this->payload($client, [
            'action_items' => [['text' => 'Call Juniper to confirm the sites', 'owner' => 'rep', 'due_date' => null, 'include' => true]],
        ]))->assertCreated()->assertJsonCount(1, 'data.tasks');

        $this->assertSame(['Call Juniper to confirm the sites'], Task::all()->pluck('title')->all());
    }

    public function test_without_a_follow_up_date_items_are_undated_and_there_is_no_reminder(): void
    {
        $rep = User::factory()->create();
        $client = Client::factory()->create(['org_id' => $rep->org_id]);
        $note = $this->note($rep);

        $this->asUser($rep)->postJson("/api/voice-notes/{$note->id}/call-log", $this->payload($client, ['follow_up' => ['date' => null, 'phrase' => null]]))
            ->assertCreated()
            ->assertJsonCount(2, 'data.tasks')
            ->assertJsonPath('data.tasks.1.due_date', null)
            ->assertJsonPath('data.follow_up', ['date' => null, 'phrase' => null]);
    }

    public function test_a_new_client_can_be_created_inline_in_the_same_organization(): void
    {
        $rep = User::factory()->create();
        $note = $this->note($rep);
        $payload = $this->payload(Client::factory()->create(['org_id' => $rep->org_id]));
        unset($payload['client_id']);
        $payload['new_client'] = ['name' => '  Wren   Applethorn ', 'company' => 'Pretend Orchard Foods'];

        $this->asUser($rep)->postJson("/api/voice-notes/{$note->id}/call-log", $payload)
            ->assertCreated()
            ->assertJsonPath('data.client.name', 'Wren Applethorn')
            ->assertJsonPath('data.tasks.2.title', 'Follow up with Wren Applethorn');

        $client = Client::where('name', 'Wren Applethorn')->firstOrFail();
        $this->assertSame($rep->org_id, $client->org_id);
        $this->assertSame('Pretend Orchard Foods', $client->company);
        $this->assertSame($client->id, $note->fresh()->client_id);
    }

    public function test_choosing_both_an_existing_and_a_new_client_is_rejected(): void
    {
        $rep = User::factory()->create();
        $note = $this->note($rep);
        $payload = $this->payload(Client::factory()->create(['org_id' => $rep->org_id]), ['new_client' => ['name' => 'Someone']]);

        $this->asUser($rep)->postJson("/api/voice-notes/{$note->id}/call-log", $payload)->assertUnprocessable()->assertJsonValidationErrors('client_id');
        $this->assertSame(1, Client::count());
    }

    public function test_a_client_from_another_organization_is_rejected(): void
    {
        $rep = User::factory()->create();
        $foreign = Client::factory()->create();
        $note = $this->note($rep);

        $this->asUser($rep)->postJson("/api/voice-notes/{$note->id}/call-log", $this->payload($foreign))
            ->assertUnprocessable()
            ->assertJsonPath('errors.client_id.0', 'That client is no longer in your list. Choose another.');

        $this->assertSame(0, CallLog::count());
        $this->assertSame(0, Task::count());
        $this->assertNull($note->fresh()->client_id);
    }

    public function test_a_note_that_is_not_ready_cannot_be_logged(): void
    {
        $rep = User::factory()->create();
        $client = Client::factory()->create(['org_id' => $rep->org_id]);
        $this->asUser($rep);

        foreach ([VoiceNoteStatus::Uploaded, VoiceNoteStatus::AwaitingTranscript, VoiceNoteStatus::Parsing, VoiceNoteStatus::Failed] as $status) {
            $note = $this->note($rep, ['status' => $status]);
            $this->postJson("/api/voice-notes/{$note->id}/call-log", $this->payload($client))
                ->assertStatus(409)
                ->assertJsonPath('message', "This note isn't ready yet. Wait for the summary, then save the log.");
        }
        $this->assertSame(0, CallLog::count());
    }

    public function test_a_second_save_is_refused_and_creates_nothing_more(): void
    {
        $rep = User::factory()->create();
        $client = Client::factory()->create(['org_id' => $rep->org_id]);
        $note = $this->note($rep);
        $this->asUser($rep)->postJson("/api/voice-notes/{$note->id}/call-log", $this->payload($client))->assertCreated();

        $this->postJson("/api/voice-notes/{$note->id}/call-log", $this->payload($client, ['summary' => 'Again']))
            ->assertStatus(409)
            ->assertJsonPath('message', 'A log has already been saved for this note. Edit that log instead.');

        $this->assertSame(1, CallLog::count());
        $this->assertSame(3, Task::count());
    }

    public function test_the_save_is_atomic(): void
    {
        $rep = User::factory()->create();
        $note = $this->note($rep);
        $payload = $this->payload(Client::factory()->create(['org_id' => $rep->org_id]));
        unset($payload['client_id']);
        $payload['new_client'] = ['name' => 'Rolled Back'];
        // Fail partway through, after the client, the log and some tasks have been written.
        Task::creating(function () {
            static $count = 0;
            if (++$count === 2) {
                throw new \RuntimeException('Simulated failure');
            }
        });

        $this->withoutExceptionHandling();
        try {
            $this->asUser($rep)->postJson("/api/voice-notes/{$note->id}/call-log", $payload);
            $this->fail('The save should have thrown.');
        } catch (\RuntimeException $e) {
            $this->assertSame('Simulated failure', $e->getMessage());
        }

        $this->assertSame(0, CallLog::count());
        $this->assertSame(0, Task::count());
        $this->assertFalse(Client::where('name', 'Rolled Back')->exists());
        $this->assertNull($note->fresh()->client_id);
    }

    public function test_the_summary_and_task_titles_are_encrypted_at_rest(): void
    {
        $rep = User::factory()->create();
        $client = Client::factory()->create(['org_id' => $rep->org_id]);
        $note = $this->note($rep);
        $this->asUser($rep)->postJson("/api/voice-notes/{$note->id}/call-log", $this->payload($client))->assertCreated();

        $summary = DB::table('call_logs')->value('summary');
        $this->assertStringNotContainsString('Juniper', $summary);
        $this->assertSame('Juniper wants to expand the pilot to two more sites.', decrypt($summary, false));
        foreach (DB::table('tasks')->pluck('title') as $title) {
            $this->assertStringNotContainsString('quote', $title);
            $this->assertStringNotContainsString('Follow up', $title);
        }
    }

    public function test_validation_errors_name_the_field(): void
    {
        $rep = User::factory()->create();
        $client = Client::factory()->create(['org_id' => $rep->org_id]);
        $note = $this->note($rep);
        $this->asUser($rep);

        $this->postJson("/api/voice-notes/{$note->id}/call-log", ['action_items' => []])
            ->assertUnprocessable()
            ->assertJsonPath('errors.client_id.0', 'Choose the client this call was with, or add a new one.')
            ->assertJsonPath('errors.summary.0', 'Write a short summary of the call.')
            ->assertJsonPath('errors.sentiment.0', 'Choose how the client felt.');

        $this->postJson("/api/voice-notes/{$note->id}/call-log", $this->payload($client, [
            'summary' => str_repeat('a', 1001),
            'sentiment' => 'Ecstatic',
            'action_items' => [
                ['text' => 'Fine', 'owner' => 'rep', 'due_date' => null, 'include' => true],
                ['text' => '', 'owner' => 'nobody', 'due_date' => 'Friday', 'include' => false],
                ['text' => '', 'owner' => 'nobody', 'due_date' => '2026-02-30', 'include' => true],
            ],
            'follow_up' => ['date' => 'next Tuesday', 'phrase' => str_repeat('b', 121)],
        ]))
            ->assertUnprocessable()
            ->assertJsonPath('errors.summary.0', 'Keep the summary under 1,000 characters.')
            ->assertJsonPath('errors.sentiment.0', 'Choose Positive, Neutral or Frustrated.')
            ->assertJsonPath('errors', fn ($errors) => ! array_key_exists('action_items.1.text', $errors) && ! array_key_exists('action_items.1.owner', $errors))
            ->assertJsonPath('errors', fn ($errors) => ! array_key_exists('action_items.0.text', $errors))
            ->assertJsonPath('errors', fn ($errors) => ($errors['action_items.2.text'][0] ?? null) === 'Describe the action item, or untick it.')
            ->assertJsonValidationErrors(['action_items.2.owner', 'action_items.2.due_date', 'follow_up.date', 'follow_up.phrase']);

        $this->postJson("/api/voice-notes/{$note->id}/call-log", $this->payload($client, [
            'action_items' => array_fill(0, 31, ['text' => 'x', 'owner' => 'rep', 'due_date' => null, 'include' => true]),
        ]))->assertUnprocessable()->assertJsonPath('errors.action_items.0', 'Keep it to 30 action items or fewer.');

        $this->assertSame(0, CallLog::count());
    }

    public function test_another_reps_note_and_log_answer_404_but_a_manager_can_save_and_edit(): void
    {
        $owner = User::factory()->create();
        $otherRep = User::factory()->create(['org_id' => $owner->org_id]);
        $manager = User::factory()->manager()->create(['org_id' => $owner->org_id]);
        $client = Client::factory()->create(['org_id' => $owner->org_id]);
        $note = $this->note($owner);

        $this->asUser($otherRep)->postJson("/api/voice-notes/{$note->id}/call-log", $this->payload($client))->assertNotFound();

        $logId = $this->asUser($manager)->postJson("/api/voice-notes/{$note->id}/call-log", $this->payload($client))
            ->assertCreated()
            ->assertJsonPath('data.author.is_you', true)
            ->json('data.id');
        // The tasks are the rep's, not the manager's.
        $this->assertSame([$owner->id], Task::pluck('assignee_id')->unique()->values()->all());

        $this->asUser($otherRep)->getJson("/api/call-logs/{$logId}")->assertNotFound()->assertExactJson(['message' => 'Not Found.']);
        $this->putJson("/api/call-logs/{$logId}", ['summary' => 'Hijacked', 'sentiment' => 'Neutral'])->assertNotFound();

        // The rep whose note it is can read it; only the author or a manager can change it.
        $this->asUser($owner)->getJson("/api/call-logs/{$logId}")->assertOk()->assertJsonPath('data.can_edit', false);
        $this->putJson("/api/call-logs/{$logId}", ['summary' => 'Changed by rep', 'sentiment' => 'Neutral'])->assertForbidden();

        $this->asUser($manager)->putJson("/api/call-logs/{$logId}", [
            'summary' => '  Updated summary ',
            'sentiment' => 'Frustrated',
            'follow_up' => ['date' => '2026-10-22', 'phrase' => 'Thursday'],
        ])
            ->assertOk()
            ->assertJsonPath('data.summary', 'Updated summary')
            ->assertJsonPath('data.sentiment', 'Frustrated')
            ->assertJsonPath('data.follow_up', ['date' => '2026-10-22', 'phrase' => 'Thursday'])
            ->assertJsonCount(3, 'data.tasks');
        $this->assertSame('Updated summary', CallLog::findOrFail($logId)->summary);
    }

    public function test_the_author_can_edit_their_log_and_edits_are_validated(): void
    {
        $rep = User::factory()->create();
        $client = Client::factory()->create(['org_id' => $rep->org_id]);
        $note = $this->note($rep);
        $logId = $this->asUser($rep)->postJson("/api/voice-notes/{$note->id}/call-log", $this->payload($client))->json('data.id');

        $this->putJson("/api/call-logs/{$logId}", ['summary' => '', 'sentiment' => 'Meh'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['summary', 'sentiment']);
        $this->putJson("/api/call-logs/{$logId}", ['summary' => 'Shorter', 'sentiment' => 'Neutral', 'follow_up' => null])
            ->assertOk()
            ->assertJsonPath('data.follow_up', ['date' => null, 'phrase' => null]);
    }

    public function test_logs_of_another_organization_answer_404_even_to_a_manager(): void
    {
        $rep = User::factory()->create();
        $client = Client::factory()->create(['org_id' => $rep->org_id]);
        $note = $this->note($rep);
        $logId = $this->asUser($rep)->postJson("/api/voice-notes/{$note->id}/call-log", $this->payload($client))->json('data.id');

        $outsider = User::factory()->manager()->create();
        $this->asUser($outsider)->getJson("/api/call-logs/{$logId}")->assertNotFound();
        $this->putJson("/api/call-logs/{$logId}", ['summary' => 'Hijacked', 'sentiment' => 'Neutral'])->assertNotFound();
        $this->postJson("/api/voice-notes/{$note->id}/call-log", $this->payload(Client::factory()->create(['org_id' => $outsider->org_id])))->assertNotFound();
    }

    public function test_a_client_with_saved_logs_cannot_be_deleted(): void
    {
        $manager = User::factory()->manager()->create();
        $client = Client::factory()->create(['org_id' => $manager->org_id]);
        $note = $this->note($manager);
        $this->asUser($manager)->postJson("/api/voice-notes/{$note->id}/call-log", $this->payload($client))->assertCreated();

        $this->deleteJson("/api/clients/{$client->id}")
            ->assertStatus(409)
            ->assertJsonPath('message', "This client has saved call logs, so it can't be deleted.");
        $this->assertTrue($client->fresh()->exists);
    }

    public function test_deleting_the_note_removes_its_log_but_keeps_the_tasks(): void
    {
        $rep = User::factory()->create();
        $client = Client::factory()->create(['org_id' => $rep->org_id]);
        $note = $this->note($rep);
        $this->asUser($rep)->postJson("/api/voice-notes/{$note->id}/call-log", $this->payload($client))->assertCreated();

        $this->deleteJson("/api/voice-notes/{$note->id}")->assertNoContent();

        $this->assertSame(0, CallLog::count());
        $this->assertSame(3, Task::whereNull('call_log_id')->count());
    }

    public static function stuckStatuses(): array
    {
        return [
            'uploaded long ago' => [5, true],
            'uploaded just now' => [1, false],
        ];
    }

    #[DataProvider('stuckStatuses')]
    public function test_a_note_stuck_at_uploaded_can_be_retried(int $minutesAgo, bool $stuck): void
    {
        Bus::fake();
        $rep = User::factory()->create();
        $note = $this->note($rep, ['status' => VoiceNoteStatus::Uploaded, 'transcript' => null, 'processing_started_at' => now()->subMinutes($minutesAgo)]);
        $this->asUser($rep);

        $this->getJson("/api/voice-notes/{$note->id}")->assertJsonPath('data.can_retry', $stuck);

        $response = $this->postJson("/api/voice-notes/{$note->id}/retry");
        if (! $stuck) {
            $response->assertStatus(409);
            Bus::assertNothingDispatched();

            return;
        }
        $response->assertAccepted()->assertJsonPath('data.status', 'uploaded')->assertJsonPath('data.can_retry', false);
        Bus::assertChained([TranscribeVoiceNote::class, ParseVoiceNote::class]);
        $this->assertSame(2, $note->fresh()->attempts);

        // The retry restarted the clock, so an immediate second retry is refused.
        $this->postJson("/api/voice-notes/{$note->id}/retry")->assertStatus(409);
    }

    public function test_a_note_uploaded_before_processing_existed_can_be_retried(): void
    {
        Bus::fake();
        $rep = User::factory()->create();
        $note = $this->note($rep, ['status' => VoiceNoteStatus::Uploaded, 'transcript' => null, 'processing_started_at' => null, 'attempts' => 0]);
        $note->forceFill(['created_at' => now()->subDay()])->save();

        $this->asUser($rep)->getJson("/api/voice-notes/{$note->id}")->assertJsonPath('data.can_retry', true);
        $this->postJson("/api/voice-notes/{$note->id}/retry")->assertAccepted();
        $this->assertSame(1, $note->fresh()->attempts);
    }

    public function test_demo_prune_removes_old_demo_tasks_only(): void
    {
        $demo = Organization::factory()->create();
        $demo->forceFill(['is_demo' => true])->save();
        $demoRep = User::factory()->create(['org_id' => $demo->id]);
        $realRep = User::factory()->create();
        foreach ([$demoRep, $realRep] as $user) {
            $this->asUser($user)->postJson('/api/tasks', ['title' => 'Old task'])->assertCreated();
        }
        $this->travel(25)->hours();
        $this->asUser($demoRep)->postJson('/api/tasks', ['title' => 'Fresh task'])->assertCreated();

        $this->artisan('voice-notes:prune-demo')->expectsOutput('Pruned 0 demo voice note(s) and 1 task(s).')->assertSuccessful();
        $this->assertSame(['Fresh task'], Task::where('org_id', $demo->id)->get()->pluck('title')->all());
        $this->assertSame(1, Task::where('org_id', $realRep->org_id)->count());
    }
}
