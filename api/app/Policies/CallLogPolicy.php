<?php

namespace App\Policies;

use App\Models\CallLog;
use App\Models\User;
use Illuminate\Auth\Access\Response;

class CallLogPolicy
{
    // The author, the rep whose note it is, or a manager. Anyone else gets 404, like the notes themselves.
    public function view(User $user, CallLog $log): Response
    {
        if ($log->org_id !== $user->org_id) {
            return Response::denyAsNotFound();
        }

        return $log->user_id === $user->id || $user->isManager() || $log->voiceNote?->user_id === $user->id
            ? Response::allow()
            : Response::denyAsNotFound();
    }

    public function update(User $user, CallLog $log): Response
    {
        $access = $this->view($user, $log);
        if ($access->denied()) {
            return $access;
        }

        return $log->user_id === $user->id || $user->isManager()
            ? Response::allow()
            : Response::deny('Only the person who saved this log, or a manager, can change it.');
    }
}
