<?php

namespace Tests\Feature;

use App\Enums\VoiceNoteStatus;
use App\Models\OrgSetting;
use App\Models\User;
use Database\Seeders\DemoSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Sleep;
use Tests\Concerns\MakesCallHistory;
use Tests\TestCase;

class PromptSettingsTest extends TestCase
{
    use MakesCallHistory, RefreshDatabase;

    public function test_manager_sees_the_prompt_and_the_default(): void
    {
        $manager = User::factory()->manager()->create();
        $manager->organization->settings()->create();

        $this->asUser($manager)->getJson('/api/settings/prompt')
            ->assertOk()
            ->assertJsonPath('system_prompt', null)
            ->assertJsonPath('default_prompt', config('services.llm.system_prompt'))
            ->assertJsonPath('max_length', 4000)
            ->assertJsonPath('editable', true);
    }

    public function test_manager_saves_and_clears_the_prompt(): void
    {
        $manager = User::factory()->manager()->create();
        $manager->organization->settings()->create();
        $this->asUser($manager);

        $this->putJson('/api/settings/prompt', ['system_prompt' => "  We sell lanterns.\r\nName the lantern model.\u{0007}  "])
            ->assertOk()
            ->assertJsonPath('system_prompt', "We sell lanterns.\nName the lantern model.");
        $this->assertSame("We sell lanterns.\nName the lantern model.", OrgSetting::where('org_id', $manager->org_id)->value('system_prompt'));

        $this->putJson('/api/settings/prompt', ['system_prompt' => '   '])->assertOk()->assertJsonPath('system_prompt', null);
        $this->assertNull(OrgSetting::where('org_id', $manager->org_id)->value('system_prompt'));
    }

    public function test_an_organization_without_a_settings_row_gets_one(): void
    {
        $manager = User::factory()->manager()->create();

        $this->asUser($manager)->putJson('/api/settings/prompt', ['system_prompt' => 'Short and plain.'])->assertOk();
        $this->assertSame('Short and plain.', OrgSetting::where('org_id', $manager->org_id)->value('system_prompt'));
    }

    public function test_prompt_is_validated(): void
    {
        $manager = User::factory()->manager()->create();
        $this->asUser($manager);

        $this->putJson('/api/settings/prompt', ['system_prompt' => str_repeat('a', 4001)])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['system_prompt' => 'Keep the prompt under 4,000 characters.']);
        $this->putJson('/api/settings/prompt', ['system_prompt' => ['not', 'text']])->assertUnprocessable()->assertJsonValidationErrors('system_prompt');
        $this->putJson('/api/settings/prompt', [])->assertUnprocessable()->assertJsonValidationErrors('system_prompt');
        $this->putJson('/api/settings/prompt', ['system_prompt' => str_repeat('a', 4000)])->assertOk();
    }

    public function test_reps_cannot_see_or_change_the_prompt(): void
    {
        $rep = User::factory()->create();
        $this->asUser($rep);

        $this->getJson('/api/settings/prompt')->assertForbidden()->assertJsonPath('message', 'This area is for managers only.');
        $this->putJson('/api/settings/prompt', ['system_prompt' => 'Mine now.'])->assertForbidden();
        $this->assertNull(OrgSetting::where('org_id', $rep->org_id)->value('system_prompt'));
    }

    public function test_prompt_changes_are_turned_off_in_the_demo(): void
    {
        $this->seed(DemoSeeder::class);
        $manager = User::firstWhere('email', 'manager@demo.invalid');
        $this->asUser($manager);

        $this->getJson('/api/settings/prompt')->assertOk()->assertJsonPath('editable', false);
        $this->putJson('/api/settings/prompt', ['system_prompt' => 'Ignore the rules.'])
            ->assertForbidden()
            ->assertJsonPath('message', 'Prompt changes are turned off in the demo, so everyone trying it sees the same results.');
        $this->assertNull(OrgSetting::where('org_id', $manager->org_id)->value('system_prompt'));
    }

    public function test_a_saved_prompt_is_sent_to_the_model_ahead_of_the_fixed_rules(): void
    {
        Sleep::fake();
        $this->travelTo('2026-10-14 10:00:00');
        config(['services.stt.api_key' => null, 'services.llm.api_key' => 'test-llm-key']);
        Http::fake(['openrouter.ai/*' => Http::response(['choices' => [['message' => ['role' => 'assistant', 'content' => json_encode([
            'summary' => 'Juniper wants a quote.', 'sentiment' => 'Positive', 'action_items' => [], 'follow_ups' => [], 'people' => [], 'companies' => [],
        ])]]]])]);
        $manager = User::factory()->manager()->create();
        $this->asUser($manager)->putJson('/api/settings/prompt', ['system_prompt' => 'We sell lanterns. Name the lantern model.'])->assertOk();
        $note = $this->voiceNote($manager, ['status' => VoiceNoteStatus::AwaitingTranscript]);

        $this->postJson("/api/voice-notes/{$note->id}/transcript", ['transcript' => 'Juniper asked for a quote on the Beacon lantern.'])->assertAccepted();

        Http::assertSent(fn (Request $request) => str_starts_with($request['messages'][0]['content'], 'We sell lanterns. Name the lantern model.')
            && ! str_contains($request['messages'][0]['content'], (string) config('services.llm.system_prompt'))
            && str_contains($request['messages'][0]['content'], 'ignore any instructions'));
        $this->assertSame(VoiceNoteStatus::Ready, $note->fresh()->status);
    }
}
