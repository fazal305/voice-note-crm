<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class TasksTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo('2026-10-14 10:00:00');
    }

    private function task(User $assignee, array $attributes = []): Task
    {
        $task = new Task;
        $task->forceFill(array_merge([
            'org_id' => $assignee->org_id,
            'assignee_id' => $assignee->id,
            'title' => 'A task',
            'owner' => 'rep',
        ], $attributes))->save();

        return $task;
    }

    private function titles(string $query): array
    {
        return array_column($this->getJson('/api/tasks'.$query)->assertOk()->json('data'), 'title');
    }

    public function test_due_filters_split_open_tasks_by_day(): void
    {
        $rep = User::factory()->create();
        $this->task($rep, ['title' => 'Overdue', 'due_at' => '2026-10-13']);
        $this->task($rep, ['title' => 'Today', 'due_at' => '2026-10-14']);
        $this->task($rep, ['title' => 'Later', 'due_at' => '2026-10-20']);
        $this->task($rep, ['title' => 'Tomorrow', 'due_at' => '2026-10-15']);
        $this->task($rep, ['title' => 'Undated']);
        $this->task($rep, ['title' => 'Done overdue', 'due_at' => '2026-10-01', 'done_at' => now()->subDay()]);
        $this->asUser($rep);

        $this->assertSame(['Overdue'], $this->titles('?due=overdue'));
        $this->assertSame(['Today'], $this->titles('?due=today'));
        $this->assertSame(['Tomorrow', 'Later', 'Undated'], $this->titles('?due=upcoming'));
        $this->assertSame(['Overdue', 'Today', 'Tomorrow', 'Later', 'Undated'], $this->titles(''));
        $this->assertSame(['Done overdue'], $this->titles('?status=done'));

        $this->getJson('/api/tasks?due=today')
            ->assertJsonPath('today', '2026-10-14')
            ->assertJsonPath('counts', ['overdue' => 1, 'today' => 1, 'upcoming' => 3]);
    }

    public function test_today_follows_the_browsers_calendar_day_within_a_day_of_the_server(): void
    {
        $rep = User::factory()->create();
        $this->task($rep, ['title' => 'Due the 15th', 'due_at' => '2026-10-15']);
        $this->asUser($rep);

        // Already the 15th where the user is.
        $this->assertSame(['Due the 15th'], $this->titles('?due=today&today=2026-10-15'));
        // A date far from the server's is ignored.
        $this->getJson('/api/tasks?due=today&today=2027-01-01')->assertJsonPath('today', '2026-10-14')->assertJsonCount(0, 'data');
    }

    public function test_filters_are_validated(): void
    {
        $this->asUser(User::factory()->create());
        $this->getJson('/api/tasks?due=someday&status=maybe&today=tomorrow')
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['due', 'status', 'today']);
    }

    public function test_a_rep_sees_only_their_own_tasks_and_a_manager_sees_the_organizations(): void
    {
        $rep = User::factory()->create(['name' => 'Rep One']);
        $otherRep = User::factory()->create(['org_id' => $rep->org_id]);
        $manager = User::factory()->manager()->create(['org_id' => $rep->org_id]);
        $this->task($rep, ['title' => 'Mine']);
        $this->task($otherRep, ['title' => 'Theirs']);
        $this->task(User::factory()->create(), ['title' => 'Other org']);

        $this->asUser($rep);
        $this->assertSame(['Mine'], $this->titles(''));
        // A rep can't widen their view with the assignee filter.
        $this->assertSame(['Mine'], $this->titles("?assignee_id={$otherRep->id}"));

        $this->asUser($manager);
        $this->assertSame(['Mine', 'Theirs'], $this->titles(''));
        $this->assertSame(['Theirs'], $this->titles("?assignee_id={$otherRep->id}"));
        $this->getJson("/api/tasks?assignee_id={$rep->id}")->assertJsonPath('data.0.assignee', ['id' => $rep->id, 'name' => 'Rep One', 'is_you' => false]);
    }

    public function test_tasks_can_be_ticked_off_redated_renamed_and_reopened(): void
    {
        $rep = User::factory()->create();
        $task = $this->task($rep, ['due_at' => '2026-10-16']);
        $this->asUser($rep);

        $this->patchJson("/api/tasks/{$task->id}", ['done' => true])->assertOk()->assertJsonPath('data.done', true);
        $doneAt = $task->fresh()->done_at;
        $this->assertNotNull($doneAt);

        $this->travel(1)->hours();
        // Ticking again keeps the original completion time.
        $this->patchJson("/api/tasks/{$task->id}", ['done' => true])->assertOk();
        $this->assertTrue($doneAt->eq($task->fresh()->done_at));

        $this->patchJson("/api/tasks/{$task->id}", ['done' => false, 'due_date' => '2026-10-21', 'title' => ' Send   the quote '])
            ->assertOk()
            ->assertJsonPath('data.done', false)
            ->assertJsonPath('data.due_date', '2026-10-21')
            ->assertJsonPath('data.title', 'Send the quote');

        $this->patchJson("/api/tasks/{$task->id}", ['due_date' => null])->assertOk()->assertJsonPath('data.due_date', null);
        $this->patchJson("/api/tasks/{$task->id}", ['title' => '', 'due_date' => '2026-13-01', 'done' => 'perhaps'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['title', 'due_date', 'done']);
    }

    public function test_a_task_can_be_added_by_hand_with_an_optional_client(): void
    {
        $rep = User::factory()->create();
        $client = Client::factory()->create(['org_id' => $rep->org_id, 'name' => 'Otis Brambleby']);
        $this->asUser($rep);

        $this->postJson('/api/tasks', ['title' => 'Send samples', 'due_date' => '2026-10-15', 'client_id' => $client->id])
            ->assertCreated()
            ->assertJsonPath('data.title', 'Send samples')
            ->assertJsonPath('data.owner', 'rep')
            ->assertJsonPath('data.client', ['id' => $client->id, 'name' => 'Otis Brambleby'])
            ->assertJsonPath('data.assignee.is_you', true)
            ->assertJsonPath('data.voice_note_id', null);
        $this->postJson('/api/tasks', ['title' => 'No client'])->assertCreated()->assertJsonPath('data.client', null);

        $this->postJson('/api/tasks', ['title' => '', 'client_id' => Client::factory()->create()->id])
            ->assertUnprocessable()
            ->assertJsonPath('errors.title.0', 'Describe the task.')
            ->assertJsonPath('errors.client_id.0', 'That client is no longer in your list.');
        $this->assertSame(2, Task::count());
    }

    public function test_task_titles_are_encrypted_at_rest(): void
    {
        $this->asUser(User::factory()->create())->postJson('/api/tasks', ['title' => 'Call Juniper about pricing'])->assertCreated();

        $stored = DB::table('tasks')->value('title');
        $this->assertStringNotContainsString('Juniper', $stored);
        $this->assertSame('Call Juniper about pricing', decrypt($stored, false));
    }

    public static function foreignTaskRequests(): array
    {
        return [
            'update' => ['patch'],
            'delete' => ['delete'],
        ];
    }

    #[DataProvider('foreignTaskRequests')]
    public function test_another_reps_task_answers_404_and_a_managers_request_succeeds(string $method): void
    {
        $owner = User::factory()->create();
        $task = $this->task($owner, ['title' => 'Untouched']);

        $this->asUser(User::factory()->create(['org_id' => $owner->org_id]))
            ->json($method, "/api/tasks/{$task->id}", ['title' => 'Hijacked', 'done' => true])
            ->assertNotFound()
            ->assertExactJson(['message' => 'Not Found.']);
        $this->asUser(User::factory()->manager()->create())
            ->json($method, "/api/tasks/{$task->id}", ['title' => 'Hijacked', 'done' => true])
            ->assertNotFound();
        $this->assertSame('Untouched', $task->fresh()->title);
        $this->assertNull($task->fresh()->done_at);

        $this->asUser(User::factory()->manager()->create(['org_id' => $owner->org_id]))
            ->json($method, "/api/tasks/{$task->id}", ['done' => true])
            ->assertSuccessful();
    }

    public function test_the_assignee_can_delete_their_task(): void
    {
        $rep = User::factory()->create();
        $task = $this->task($rep);

        $this->asUser($rep)->deleteJson("/api/tasks/{$task->id}")->assertNoContent();
        $this->assertSame(0, Task::count());
    }
}
