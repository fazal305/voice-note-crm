<?php

namespace App\Policies;

use App\Models\User;
use App\Models\VoiceNote;
use Illuminate\Auth\Access\Response;

class VoiceNotePolicy
{
    public function view(User $user, VoiceNote $note): Response
    {
        return $this->ownerOrManager($user, $note);
    }

    // Retrying processing or supplying a transcript.
    public function process(User $user, VoiceNote $note): Response
    {
        return $this->ownerOrManager($user, $note);
    }

    public function delete(User $user, VoiceNote $note): Response
    {
        return $this->ownerOrManager($user, $note);
    }

    // A rep's notes are private to them; a manager sees the whole organization. Anything else answers 404
    // so other people's notes can't be probed.
    private function ownerOrManager(User $user, VoiceNote $note): Response
    {
        if ($note->org_id !== $user->org_id) {
            return Response::denyAsNotFound();
        }

        return $note->user_id === $user->id || $user->isManager() ? Response::allow() : Response::denyAsNotFound();
    }
}
