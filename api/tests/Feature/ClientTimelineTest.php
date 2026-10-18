<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\MakesCallHistory;
use Tests\TestCase;

class ClientTimelineTest extends TestCase
{
    use MakesCallHistory, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo('2026-10-14 10:00:00');
    }

    public function test_timeline_lists_logs_newest_first_with_tasks_and_note_link(): void
    {
        $rep = User::factory()->create(['name' => 'Rae']);
        $client = Client::factory()->create(['org_id' => $rep->org_id]);
        $this->travelTo('2026-10-10 09:00:00');
        $older = $this->callLog($rep, $client, ['summary' => 'First call.', 'sentiment' => 'Frustrated']);
        $this->travelTo('2026-10-12 09:00:00');
        $newer = $this->callLog($rep, $client, ['summary' => 'Second call.', 'sentiment' => 'Positive', 'follow_up_at' => '2026-10-20', 'follow_up_phrase' => 'next Tuesday']);
        $this->taskFor($rep, ['call_log_id' => $newer->id, 'client_id' => $client->id, 'title' => 'Send quote', 'due_at' => '2026-10-16']);
        $this->taskFor($rep, ['call_log_id' => $newer->id, 'client_id' => $client->id, 'title' => 'Done already', 'done_at' => now()]);

        $this->asUser($rep)->getJson("/api/clients/{$client->id}/timeline")
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.id', $newer->id)
            ->assertJsonPath('data.0.summary', 'Second call.')
            ->assertJsonPath('data.0.sentiment', 'Positive')
            ->assertJsonPath('data.0.follow_up', ['date' => '2026-10-20', 'phrase' => 'next Tuesday'])
            ->assertJsonPath('data.0.author', ['name' => 'Rae', 'is_you' => true])
            ->assertJsonPath('data.0.voice_note_id', $newer->voice_note_id)
            ->assertJsonPath('data.0.created_at', '2026-10-12T09:00:00+00:00')
            ->assertJsonPath('data.0.tasks.0.title', 'Send quote')
            ->assertJsonPath('data.0.tasks.0.due_date', '2026-10-16')
            ->assertJsonPath('data.0.tasks.0.done', false)
            ->assertJsonPath('data.0.tasks.1.done', true)
            ->assertJsonPath('data.1.id', $older->id)
            ->assertJsonPath('data.1.sentiment', 'Frustrated')
            ->assertJsonPath('data.1.tasks', []);
    }

    public function test_timeline_is_cursor_paginated(): void
    {
        $rep = User::factory()->create();
        $client = Client::factory()->create(['org_id' => $rep->org_id]);
        $ids = [];
        foreach (range(1, 23) as $i) {
            $this->travel(1)->minutes();
            $ids[] = $this->callLog($rep, $client, ['summary' => "Call {$i}"])->id;
        }
        // Two logs saved in the same second still keep a stable order (by id).
        $ids[] = $this->callLog($rep, $client)->id;
        $expected = array_reverse($ids);
        $this->asUser($rep);

        $first = $this->getJson("/api/clients/{$client->id}/timeline")->assertOk();
        $this->assertSame(array_slice($expected, 0, 20), array_column($first->json('data'), 'id'));
        $cursor = $first->json('meta.next_cursor');
        $this->assertNotNull($cursor);

        $second = $this->getJson("/api/clients/{$client->id}/timeline?cursor={$cursor}")->assertOk();
        $this->assertSame(array_slice($expected, 20), array_column($second->json('data'), 'id'));
        $this->assertNull($second->json('meta.next_cursor'));
    }

    public function test_rep_sees_only_their_own_calls_and_tasks_while_a_manager_sees_all(): void
    {
        $manager = User::factory()->manager()->create();
        $rep = User::factory()->create(['org_id' => $manager->org_id]);
        $teammate = User::factory()->create(['org_id' => $manager->org_id, 'name' => 'Tess']);
        $client = Client::factory()->create(['org_id' => $manager->org_id]);
        $mine = $this->callLog($rep, $client, ['summary' => 'Mine']);
        $theirs = $this->callLog($teammate, $client, ['summary' => 'Theirs']);
        // A manager saved this log for the rep's own note: it is still the rep's call.
        $savedForMe = $this->callLog($manager, $client, ['summary' => 'Saved by the manager'], noteOwner: $rep);
        $this->taskFor($rep, ['call_log_id' => $mine->id, 'client_id' => $client->id, 'title' => 'My task']);
        $this->taskFor($teammate, ['call_log_id' => $mine->id, 'client_id' => $client->id, 'title' => 'Not mine']);

        $seen = collect($this->asUser($rep)->getJson("/api/clients/{$client->id}/timeline")->assertOk()->json('data'))->keyBy('id');
        $this->assertEqualsCanonicalizing([$mine->id, $savedForMe->id], $seen->keys()->all());
        $this->assertSame(['My task'], array_column($seen[$mine->id]['tasks'], 'title'));
        $this->assertSame($savedForMe->voice_note_id, $seen[$savedForMe->id]['voice_note_id']);

        $all = collect($this->asUser($manager)->getJson("/api/clients/{$client->id}/timeline")->assertOk()->json('data'))->keyBy('id');
        $this->assertEqualsCanonicalizing([$mine->id, $theirs->id, $savedForMe->id], $all->keys()->all());
        $this->assertCount(2, $all[$mine->id]['tasks']);
        $this->assertSame($theirs->voice_note_id, $all[$theirs->id]['voice_note_id']);
        $this->assertSame(['name' => 'Tess', 'is_you' => false], $all[$theirs->id]['author']);
    }

    public function test_note_link_is_hidden_when_the_viewer_cannot_open_the_note(): void
    {
        $rep = User::factory()->create();
        $teammate = User::factory()->create(['org_id' => $rep->org_id]);
        $client = Client::factory()->create(['org_id' => $rep->org_id]);
        // The rep saved it, but the note is a teammate's, which the rep cannot open.
        $log = $this->callLog($rep, $client, noteOwner: $teammate);

        $this->asUser($rep)->getJson("/api/clients/{$client->id}/timeline")
            ->assertOk()
            ->assertJsonPath('data.0.id', $log->id)
            ->assertJsonPath('data.0.voice_note_id', null);
        $this->getJson("/api/voice-notes/{$log->voice_note_id}")->assertNotFound();
    }

    public function test_other_organizations_clients_are_not_found(): void
    {
        $rep = User::factory()->create();
        $other = Client::factory()->create();
        $this->callLog(User::factory()->create(['org_id' => $other->org_id]), $other);

        $this->asUser($rep)->getJson("/api/clients/{$other->id}/timeline")->assertNotFound();
        $this->getJson("/api/clients/{$other->id}")->assertNotFound();
        $this->getJson('/api/clients/999999/timeline')->assertNotFound();
    }

    public function test_timeline_query_count_does_not_grow_with_entries(): void
    {
        $manager = User::factory()->manager()->create();
        $client = Client::factory()->create(['org_id' => $manager->org_id]);
        $reps = User::factory()->count(3)->create(['org_id' => $manager->org_id]);
        $this->asUser($manager);
        $timeline = fn () => $this->getJson("/api/clients/{$client->id}/timeline")->assertOk();

        $log = $this->callLog($reps[0], $client);
        $this->taskFor($reps[0], ['call_log_id' => $log->id, 'client_id' => $client->id]);
        $few = $this->countQueries($timeline);

        foreach (range(1, 15) as $i) {
            $log = $this->callLog($reps[$i % 3], $client);
            $this->taskFor($reps[$i % 3], ['call_log_id' => $log->id, 'client_id' => $client->id]);
        }
        $many = $this->countQueries($timeline);

        $this->assertSame($few, $many);
        $this->assertLessThanOrEqual(6, $many);
    }

    public function test_client_detail_includes_contact_stats_from_the_viewers_calls(): void
    {
        $rep = User::factory()->create();
        $client = Client::factory()->create(['org_id' => $rep->org_id]);
        $this->travelTo('2026-10-05 09:00:00');
        $this->callLog($rep, $client, ['sentiment' => 'Positive', 'follow_up_at' => '2026-10-21', 'follow_up_phrase' => 'in two weeks']);
        $this->travelTo('2026-10-12 15:00:00');
        $this->callLog($rep, $client, ['sentiment' => 'Frustrated', 'follow_up_at' => '2026-10-16', 'follow_up_phrase' => 'Friday']);
        $this->travelTo('2026-10-14 10:00:00');
        $this->taskFor($rep, ['client_id' => $client->id]);
        $this->taskFor($rep, ['client_id' => $client->id, 'done_at' => now()]);

        $this->asUser($rep)->getJson("/api/clients/{$client->id}")
            ->assertOk()
            ->assertJsonPath('data.name', $client->name)
            ->assertJsonPath('stats.last_contact_at', '2026-10-12T15:00:00+00:00')
            ->assertJsonPath('stats.latest_sentiment', 'Frustrated')
            ->assertJsonPath('stats.open_tasks', 1)
            ->assertJsonPath('stats.next_follow_up', ['date' => '2026-10-16', 'phrase' => 'Friday'])
            ->assertJsonPath('stats.needs_follow_up', false);

        // After the latest follow-up date passes with no new call, the client needs a follow-up.
        $this->travelTo('2026-10-17 10:00:00');
        $this->getJson("/api/clients/{$client->id}")
            ->assertJsonPath('stats.needs_follow_up', true)
            ->assertJsonPath('stats.next_follow_up.date', '2026-10-21');

        // A rep with no calls of their own for this client sees no contact history.
        $teammate = User::factory()->create(['org_id' => $rep->org_id]);
        $this->asUser($teammate)->getJson("/api/clients/{$client->id}")
            ->assertJsonPath('stats.last_contact_at', null)
            ->assertJsonPath('stats.latest_sentiment', null)
            ->assertJsonPath('stats.open_tasks', 0)
            ->assertJsonPath('stats.next_follow_up', null)
            ->assertJsonPath('stats.needs_follow_up', false);
    }

    public function test_client_list_sorts_by_last_contact_and_filters_overdue_follow_ups(): void
    {
        $rep = User::factory()->create();
        $make = fn (string $name) => Client::factory()->create(['org_id' => $rep->org_id, 'name' => $name]);
        $never = $make('Aaron never called');
        $old = $make('Bea called long ago');
        $recent = $make('Cy called recently');
        $overdue = $make('Dee follow-up passed');
        $superseded = $make('Eve follow-up passed but called since');

        $this->travelTo('2026-09-01 09:00:00');
        $this->callLog($rep, $old);
        $this->travelTo('2026-10-01 09:00:00');
        $this->callLog($rep, $overdue, ['follow_up_at' => '2026-10-10']);
        $this->callLog($rep, $superseded, ['follow_up_at' => '2026-10-05']);
        $this->travelTo('2026-10-13 09:00:00');
        $this->callLog($rep, $recent, ['follow_up_at' => '2026-10-30']);
        $this->travelTo('2026-10-13 09:05:00');
        $this->callLog($rep, $superseded);
        $this->travelTo('2026-10-14 10:00:00');
        $this->asUser($rep);

        $names = fn (string $query) => array_column($this->getJson('/api/clients'.$query)->assertOk()->json('data'), 'name');

        $this->assertSame([$superseded->name, $recent->name, $overdue->name, $old->name, $never->name], $names('?sort=last_contact'));
        $this->assertSame([$overdue->name], $names('?needs_follow_up=1'));
        $this->assertSame([], $names('?needs_follow_up=1&search=Eve'));
        $this->getJson('/api/clients?sort=last_contact')
            ->assertJsonPath('data.0.last_contact_at', '2026-10-13T09:05:00+00:00')
            ->assertJsonPath('data.4.last_contact_at', null);
        $this->getJson('/api/clients?sort=newest&needs_follow_up=maybe')->assertUnprocessable()->assertJsonValidationErrors(['sort', 'needs_follow_up']);

        // Another rep's calls don't count towards what this rep sees.
        $this->asUser(User::factory()->create(['org_id' => $rep->org_id]));
        $this->assertSame([], $names('?needs_follow_up=1'));
    }

    public function test_client_list_query_count_does_not_grow_with_clients(): void
    {
        $rep = User::factory()->create();
        $this->asUser($rep);
        $list = function () {
            $this->getJson('/api/clients?sort=last_contact&needs_follow_up=1')->assertOk();
            $this->getJson('/api/clients?sort=last_contact')->assertOk();
        };

        $this->callLog($rep, Client::factory()->create(['org_id' => $rep->org_id]), ['follow_up_at' => '2026-10-01']);
        $few = $this->countQueries($list);
        foreach (range(1, 20) as $i) {
            $this->callLog($rep, Client::factory()->create(['org_id' => $rep->org_id]), ['follow_up_at' => '2026-10-01']);
        }
        $many = $this->countQueries($list);

        $this->assertSame($few, $many);
    }
}
