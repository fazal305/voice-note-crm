<?php

namespace App\Http\Controllers\Api;

use App\Enums\VoiceNoteSource;
use App\Enums\VoiceNoteStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\VoiceNoteRequest;
use App\Http\Resources\VoiceNoteResource;
use App\Models\VoiceNote;
use App\Services\AudioVault;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
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

    public function show(VoiceNote $voiceNote): VoiceNoteResource
    {
        Gate::authorize('view', $voiceNote);

        return new VoiceNoteResource($voiceNote->load(['client:id,name', 'user:id,name']));
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

    /**
     * The one place processing begins once a note's audio is safely stored. Milestone 3 dispatches the
     * transcription job here; until then a note stays "uploaded".
     */
    private function startProcessing(VoiceNote $note): void {}

    // The original filename is display-only: path parts and anything but letters, digits and simple punctuation are dropped.
    private function displayName(string $name): ?string
    {
        $name = preg_replace('/[^\p{L}\p{N} ._()\-]+/u', '', basename(str_replace('\\', '/', $name))) ?? '';
        $name = trim(Str::limit(trim($name), 120, ''));

        return $name === '' ? null : $name;
    }
}
