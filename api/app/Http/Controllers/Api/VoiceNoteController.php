<?php

namespace App\Http\Controllers\Api;

use App\Enums\VoiceNoteSource;
use App\Enums\VoiceNoteStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\TranscriptRequest;
use App\Http\Requests\VoiceNoteRequest;
use App\Http\Resources\VoiceNoteDetailResource;
use App\Http\Resources\VoiceNoteResource;
use App\Jobs\ParseVoiceNote;
use App\Jobs\TranscribeVoiceNote;
use App\Models\VoiceNote;
use App\Services\AudioVault;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

class VoiceNoteController extends Controller
{
    public function __construct(private AudioVault $vault) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $user = $request->user();

        $notes = VoiceNote::query()
            ->where('org_id', $user->org_id)
            ->unless($user->isManager(), fn ($query) => $query->where('user_id', $user->id))
            ->with(['client:id,name', 'user:id,name'])
            ->latest()
            ->orderByDesc('id')
            ->paginate(20);

        return VoiceNoteResource::collection($notes);
    }

    public function store(VoiceNoteRequest $request): JsonResponse
    {
        $user = $request->user();
        $file = $request->file('audio');
        $extension = $request->extension();
        $source = VoiceNoteSource::from($request->validated('source'));
        $key = "org-{$user->org_id}/".bin2hex(random_bytes(24)).'.enc';

        $this->vault->put($key, $file->get());

        try {
            $note = new VoiceNote;
            $note->forceFill([
                'org_id' => $user->org_id,
                'user_id' => $user->id,
                'client_id' => $request->validated('client_id'),
                'status' => VoiceNoteStatus::Uploaded,
                'source' => $source,
                'storage_key' => $key,
                'mime' => VoiceNoteRequest::SERVED_TYPES[$extension],
                'size_bytes' => $file->getSize(),
                'duration_seconds' => $request->validated('duration_seconds'),
                'original_name' => $source === VoiceNoteSource::Upload ? $this->displayName($file->getClientOriginalName()) : null,
            ])->save();
        } catch (Throwable $e) {
            $this->vault->delete($key);
            throw $e;
        }

        $this->startProcessing($note);

        return (new VoiceNoteResource($note->load(['client:id,name', 'user:id,name'])))->response()->setStatusCode(201);
    }

    public function show(VoiceNote $voiceNote): VoiceNoteDetailResource
    {
        Gate::authorize('view', $voiceNote);

        return new VoiceNoteDetailResource($voiceNote->load(['client:id,name', 'user:id,name', 'suggestedClient:id,org_id,name']));
    }

    /** Runs processing again for a failed note: from the transcript if there is one, otherwise from the audio. */
    public function retry(VoiceNote $voiceNote): JsonResponse
    {
        Gate::authorize('process', $voiceNote);

        if ($voiceNote->status !== VoiceNoteStatus::Failed) {
            return response()->json(['message' => 'Only a note that failed can be retried.'], 409);
        }
        if ($voiceNote->attempts >= VoiceNote::MAX_ATTEMPTS) {
            return $this->tooManyAttempts();
        }

        $hasTranscript = $voiceNote->transcript !== null;
        if (! $this->claim($voiceNote, [VoiceNoteStatus::Failed], $hasTranscript ? VoiceNoteStatus::Parsing : VoiceNoteStatus::Uploaded)) {
            return response()->json(['message' => 'This note is already being processed.'], 409);
        }

        if ($hasTranscript) {
            ParseVoiceNote::dispatch($voiceNote->id);
        } else {
            $this->dispatchChain($voiceNote);
        }

        return $this->detail($voiceNote);
    }

    /** A transcript typed or pasted by the user, for notes no speech-to-text service could transcribe. */
    public function transcript(TranscriptRequest $request, VoiceNote $voiceNote): JsonResponse
    {
        $waiting = $voiceNote->status === VoiceNoteStatus::AwaitingTranscript
            || ($voiceNote->status === VoiceNoteStatus::Failed && $voiceNote->transcript === null);
        if (! $waiting) {
            return response()->json(['message' => "This note isn't waiting for a transcript."], 409);
        }
        if ($voiceNote->attempts >= VoiceNote::MAX_ATTEMPTS) {
            return $this->tooManyAttempts();
        }
        if (! $this->claim($voiceNote, [VoiceNoteStatus::AwaitingTranscript, VoiceNoteStatus::Failed], VoiceNoteStatus::Parsing)) {
            return response()->json(['message' => 'This note is already being processed.'], 409);
        }

        $voiceNote->refresh()->forceFill(['transcript' => $request->transcript()])->save();
        ParseVoiceNote::dispatch($voiceNote->id);

        return $this->detail($voiceNote);
    }

    public function audio(VoiceNote $voiceNote): Response
    {
        Gate::authorize('view', $voiceNote);

        return response($this->vault->get($voiceNote->storage_key), 200, [
            'Content-Type' => $voiceNote->mime,
            'Content-Disposition' => 'inline',
            'Cache-Control' => 'private, no-store',
        ]);
    }

    public function destroy(VoiceNote $voiceNote): JsonResponse
    {
        Gate::authorize('delete', $voiceNote);

        $voiceNote->delete();
        try {
            $this->vault->delete($voiceNote->storage_key);
        } catch (Throwable $e) {
            Log::warning('Voice note audio could not be deleted.', ['voice_note_id' => $voiceNote->id, 'error' => $e->getMessage()]);
        }

        return response()->json(null, 204);
    }

    /** The one place processing begins once a note's audio is safely stored. */
    private function startProcessing(VoiceNote $note): void
    {
        $note->forceFill(['attempts' => 1, 'processing_started_at' => now()])->save();
        $this->dispatchChain($note);
    }

    private function dispatchChain(VoiceNote $note): void
    {
        Bus::chain([new TranscribeVoiceNote($note->id), new ParseVoiceNote($note->id)])->dispatch();
    }

    /**
     * Moves the note from one of the given statuses to the next in a single conditional update, so a double
     * click or two tabs can't start two paid processing runs.
     */
    private function claim(VoiceNote $note, array $from, VoiceNoteStatus $to): bool
    {
        return VoiceNote::whereKey($note->id)
            ->whereIn('status', array_map(fn (VoiceNoteStatus $s) => $s->value, $from))
            ->where('attempts', '<', VoiceNote::MAX_ATTEMPTS)
            ->update([
                'status' => $to->value,
                'error' => null,
                'attempts' => DB::raw('attempts + 1'),
                'processing_started_at' => now(),
                'updated_at' => now(),
            ]) === 1;
    }

    private function detail(VoiceNote $note): JsonResponse
    {
        $note->refresh()->load(['client:id,name', 'user:id,name', 'suggestedClient:id,org_id,name']);

        return (new VoiceNoteDetailResource($note))->response()->setStatusCode(202);
    }

    private function tooManyAttempts(): JsonResponse
    {
        return response()->json(['message' => "This note can't be processed again. Record or upload it as a new note."], 422);
    }

    // The original filename is display-only: path parts and anything but letters, digits and simple punctuation are dropped.
    private function displayName(string $name): ?string
    {
        $name = preg_replace('/[^\p{L}\p{N} ._()\-]+/u', '', basename(str_replace('\\', '/', $name))) ?? '';
        $name = trim(Str::limit(trim($name), 120, ''));

        return $name === '' ? null : $name;
    }
}
