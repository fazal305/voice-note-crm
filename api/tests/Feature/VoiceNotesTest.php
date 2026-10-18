<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\User;
use App\Models\VoiceNote;
use App\Services\AudioVault;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\DataProvider;
use RuntimeException;
use Tests\TestCase;

class VoiceNotesTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('audio');
    }

    /** A short, valid 8 kHz mono 16-bit PCM WAV of silence. */
    private static function wav(int $samples = 800): string
    {
        $data = str_repeat("\0\0", $samples);

        return 'RIFF'.pack('V', 36 + strlen($data)).'WAVE'
            .'fmt '.pack('VvvVVvv', 16, 1, 1, 8000, 16000, 2, 16)
            .'data'.pack('V', strlen($data)).$data;
    }

    /** The start of a WebM file: an EBML header with the "webm" doctype, which is what finfo looks for. */
    private static function webm(): string
    {
        return hex2bin('1a45dfa39f4286810142f7810142f2810442f381084282847765626d42878104428581021853').str_repeat("\0", 64);
    }

    private function upload(array $overrides = [], ?UploadedFile $file = null)
    {
        return $this->post('/api/voice-notes', array_merge([
            'source' => 'upload',
            'audio' => $file ?? UploadedFile::fake()->createWithContent('Call with Amy.wav', self::wav()),
        ], $overrides), ['Accept' => 'application/json']);
    }

    private function noteFor(User $user): VoiceNote
    {
        $id = $this->asUser($user)->upload()->assertCreated()->json('data.id');

        return VoiceNote::findOrFail($id);
    }

    public function test_voice_notes_require_authentication(): void
    {
        $this->getJson('/api/voice-notes')->assertUnauthorized();
        $this->upload()->assertUnauthorized();
    }

    public function test_upload_is_stored_encrypted_and_plays_back(): void
    {
        $rep = User::factory()->create();
        $client = Client::factory()->create(['org_id' => $rep->org_id]);
        $original = self::wav();

        $response = $this->asUser($rep)->upload([
            'client_id' => $client->id,
            'duration_seconds' => 4,
        ], UploadedFile::fake()->createWithContent('Call <with> Amy.wav', $original));

        $response->assertCreated()
            ->assertJsonPath('data.status', 'uploaded')
            ->assertJsonPath('data.source', 'upload')
            ->assertJsonPath('data.mime', 'audio/wav')
            ->assertJsonPath('data.size_bytes', strlen($original))
            ->assertJsonPath('data.duration_seconds', 4)
            ->assertJsonPath('data.original_name', 'Call with Amy.wav')
            ->assertJsonPath('data.client.name', $client->name)
            ->assertJsonMissingPath('data.storage_key');

        $note = VoiceNote::findOrFail($response->json('data.id'));
        $this->assertSame($rep->org_id, $note->org_id);
        $this->assertStringNotContainsString('Amy', $note->storage_key);

        $stored = Storage::disk('audio')->get($note->storage_key);
        $this->assertNotSame($original, $stored);
        $this->assertStringNotContainsString('RIFF', $stored);
        $this->assertStringNotContainsString('WAVE', $stored);
        $this->assertSame($original, app(AudioVault::class)->get($note->storage_key));

        $audio = $this->get("/api/voice-notes/{$note->id}/audio")->assertOk()->assertHeader('Content-Type', 'audio/wav');
        $this->assertSame($original, $audio->getContent());

        $this->getJson("/api/voice-notes/{$note->id}")->assertOk()->assertJsonPath('data.id', $note->id)->assertJsonMissingPath('data.storage_key');
        $this->getJson('/api/voice-notes')->assertOk()->assertJsonCount(1, 'data')->assertJsonMissingPath('data.0.storage_key');
    }

    public function test_tampered_audio_fails_its_integrity_check(): void
    {
        $note = $this->noteFor(User::factory()->create());
        $blob = Storage::disk('audio')->get($note->storage_key);
        Storage::disk('audio')->put($note->storage_key, substr($blob, 0, -1).chr(ord($blob[-1]) ^ 1));

        $this->expectException(RuntimeException::class);
        app(AudioVault::class)->get($note->storage_key);
    }

    public function test_browser_recordings_may_be_webm_but_uploads_may_not(): void
    {
        $this->asUser(User::factory()->create())
            ->upload(['source' => 'recording'], UploadedFile::fake()->createWithContent('recording.webm', self::webm()))
            ->assertCreated()
            ->assertJsonPath('data.source', 'recording')
            ->assertJsonPath('data.mime', 'audio/webm')
            ->assertJsonPath('data.original_name', null);

        $this->upload(['source' => 'upload'], UploadedFile::fake()->createWithContent('recording.webm', self::webm()))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['audio' => 'Upload an .mp3, .wav or .m4a file.']);
    }

    public static function rejectedFiles(): array
    {
        return [
            'extension not allowed' => ['notes.txt', 'just some text', 'Upload an .mp3, .wav or .m4a file.'],
            'text renamed .mp3' => ['notes.mp3', "Meeting notes\nCall Amy back on Tuesday.\n", "That file isn't valid .mp3 audio."],
            'html renamed .wav' => ['page.wav', '<!doctype html><html><body>hi</body></html>', "That file isn't valid .wav audio."],
            'wav renamed .m4a' => ['call.m4a', null, "That file isn't valid .m4a audio."],
        ];
    }

    #[DataProvider('rejectedFiles')]
    public function test_files_that_are_not_allowed_audio_are_rejected(string $name, ?string $contents, string $message): void
    {
        $this->asUser(User::factory()->create())
            ->upload([], UploadedFile::fake()->createWithContent($name, $contents ?? self::wav()))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['audio' => $message]);

        $this->assertSame(0, VoiceNote::count());
        $this->assertSame([], Storage::disk('audio')->allFiles());
    }

    public function test_files_over_25mb_are_rejected(): void
    {
        $this->asUser(User::factory()->create())
            ->upload([], UploadedFile::fake()->create('long.wav', 25 * 1024 + 1, 'audio/wav'))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['audio' => 'That file is larger than 25 MB.']);

        $this->assertSame(0, VoiceNote::count());
    }

    public function test_client_must_belong_to_the_users_organization(): void
    {
        $foreign = Client::factory()->create();

        $this->asUser(User::factory()->create())
            ->upload(['client_id' => $foreign->id])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['client_id' => 'Choose a client from your organization.']);

        $this->assertSame(0, VoiceNote::count());
    }

    public function test_source_must_be_known(): void
    {
        $this->asUser(User::factory()->create())
            ->upload(['source' => 'telepathy'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['source']);
    }

    public static function noteRoutes(): array
    {
        return [
            'show' => ['get', ''],
            'audio' => ['get', '/audio'],
            'delete' => ['delete', ''],
        ];
    }

    #[DataProvider('noteRoutes')]
    public function test_notes_of_another_organization_answer_404(string $method, string $suffix): void
    {
        $note = $this->noteFor(User::factory()->create());

        $this->asUser(User::factory()->manager()->create())->json($method, "/api/voice-notes/{$note->id}{$suffix}")
            ->assertNotFound()
            ->assertExactJson(['message' => 'Not Found.']);

        $this->assertModelExists($note);
        $this->assertTrue(Storage::disk('audio')->exists($note->storage_key));
    }

    #[DataProvider('noteRoutes')]
    public function test_a_rep_cannot_reach_another_reps_note(string $method, string $suffix): void
    {
        $note = $this->noteFor(User::factory()->create());
        $otherRep = User::factory()->create(['org_id' => $note->org_id]);

        $this->asUser($otherRep)->json($method, "/api/voice-notes/{$note->id}{$suffix}")->assertNotFound();
        $this->getJson('/api/voice-notes')->assertOk()->assertJsonCount(0, 'data');

        $this->assertModelExists($note);
        $this->assertTrue(Storage::disk('audio')->exists($note->storage_key));
    }

    public function test_missing_and_foreign_notes_are_indistinguishable(): void
    {
        $note = $this->noteFor(User::factory()->create());

        $this->asUser(User::factory()->create());
        $missing = $this->getJson('/api/voice-notes/999999/audio')->assertNotFound()->json();
        $foreign = $this->getJson("/api/voice-notes/{$note->id}/audio")->assertNotFound()->json();

        $this->assertSame($missing, $foreign);
    }

    public function test_manager_sees_and_can_delete_any_note_in_their_organization(): void
    {
        $rep = User::factory()->create();
        $note = $this->noteFor($rep);
        $this->noteFor(User::factory()->create());
        $manager = User::factory()->manager()->create(['org_id' => $rep->org_id]);

        $this->asUser($manager)->getJson('/api/voice-notes')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.owner.name', $rep->name)
            ->assertJsonPath('data.0.owner.is_you', false);
        $this->get("/api/voice-notes/{$note->id}/audio")->assertOk();

        $this->deleteJson("/api/voice-notes/{$note->id}")->assertNoContent();
        $this->assertModelMissing($note);
        $this->assertFalse(Storage::disk('audio')->exists($note->storage_key));
    }

    public function test_rep_deletes_their_own_note_and_its_audio(): void
    {
        $rep = User::factory()->create();
        $note = $this->noteFor($rep);

        $this->asUser($rep)->deleteJson("/api/voice-notes/{$note->id}")->assertNoContent();

        $this->assertModelMissing($note);
        $this->assertSame([], Storage::disk('audio')->allFiles());
    }

    public function test_list_is_newest_first_and_only_the_reps_own(): void
    {
        $rep = User::factory()->create();
        $this->travel(-2)->hours();
        $older = $this->noteFor($rep);
        $this->travelBack();
        $newer = $this->noteFor($rep);
        $this->noteFor(User::factory()->create(['org_id' => $rep->org_id]));

        $this->asUser($rep)->getJson('/api/voice-notes')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.id', $newer->id)
            ->assertJsonPath('data.1.id', $older->id)
            ->assertJsonPath('data.0.owner.is_you', true);
    }

    public function test_uploads_are_rate_limited_per_user(): void
    {
        $this->asUser(User::factory()->create());

        for ($i = 0; $i < 10; $i++) {
            $this->upload()->assertCreated();
        }

        $this->upload()
            ->assertStatus(429)
            ->assertExactJson(['message' => 'Too many requests. Please wait a minute and try again.'])
            ->assertHeader('Retry-After');
        $this->assertSame(10, VoiceNote::count());
    }

    public function test_uploads_are_rate_limited_per_ip_across_users(): void
    {
        $org = User::factory()->create()->org_id;

        for ($i = 0; $i < 30; $i++) {
            $this->asUser(User::factory()->create(['org_id' => $org]))->upload()->assertCreated();
        }

        $this->asUser(User::factory()->create(['org_id' => $org]))->upload()->assertStatus(429);
    }

    public function test_a_retried_upload_with_the_same_client_upload_id_returns_the_first_note(): void
    {
        $rep = User::factory()->create();
        $uploadId = (string) Str::uuid();

        $first = $this->asUser($rep)->upload(['client_upload_id' => $uploadId])->assertCreated()->json('data.id');
        $this->asUser($rep)->upload(['client_upload_id' => $uploadId])
            ->assertOk()
            ->assertJsonPath('data.id', $first);

        $this->assertSame(1, VoiceNote::count());
        $this->assertCount(1, Storage::disk('audio')->allFiles());
        $this->assertSame(1, VoiceNote::findOrFail($first)->attempts);
    }

    public function test_uploads_without_a_client_upload_id_are_never_merged(): void
    {
        $rep = User::factory()->create();

        $this->asUser($rep)->upload()->assertCreated();
        $this->asUser($rep)->upload()->assertCreated();

        $this->assertSame(2, VoiceNote::count());
    }

    public function test_the_same_client_upload_id_from_another_user_creates_their_own_note(): void
    {
        $rep = User::factory()->create();
        $colleague = User::factory()->create(['org_id' => $rep->org_id]);
        $stranger = User::factory()->create();
        $uploadId = (string) Str::uuid();

        $first = $this->asUser($rep)->upload(['client_upload_id' => $uploadId])->assertCreated()->json('data.id');

        foreach ([$colleague, $stranger] as $other) {
            $response = $this->asUser($other)->upload(['client_upload_id' => $uploadId])->assertCreated();
            $this->assertNotSame($first, $response->json('data.id'));
            $response->assertJsonPath('data.owner.is_you', true);
            $this->assertSame($other->id, VoiceNote::findOrFail($response->json('data.id'))->user_id);
        }

        $this->assertSame(3, VoiceNote::count());
        $this->getJson('/api/voice-notes')->assertJsonCount(1, 'data');
    }

    public function test_a_concurrent_duplicate_returns_the_note_that_won_and_drops_the_extra_audio(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            // The simulated race fails inside RefreshDatabase's transaction, which PostgreSQL then aborts.
            // A real request runs outside a transaction, so its lookup after the violation still works.
            $this->markTestSkipped('Needs a database that keeps a transaction usable after a unique violation.');
        }

        $rep = User::factory()->create();
        $uploadId = (string) Str::uuid();
        $other = $this->noteFor($rep);

        // Another request with the same id saves its note between this request's check and its insert.
        $winner = null;
        VoiceNote::creating(function (VoiceNote $note) use (&$winner, $other, $uploadId) {
            if ($winner || $note->client_upload_id !== $uploadId) {
                return;
            }
            $winner = $other->replicate();
            $winner->client_upload_id = $uploadId;
            $winner->storage_key = $other->storage_key.'-winner';
            VoiceNote::withoutEvents(fn () => $winner->save());
        });

        $this->asUser($rep)->upload(['client_upload_id' => $uploadId])
            ->assertOk()
            ->assertJsonPath('data.id', $winner->id);

        $this->assertSame(2, VoiceNote::count());
        $this->assertSame([$other->storage_key], Storage::disk('audio')->allFiles());
    }

    public function test_client_upload_id_must_be_a_uuid(): void
    {
        $this->asUser(User::factory()->create())->upload(['client_upload_id' => 'not-a-uuid'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('client_upload_id');
    }
}
