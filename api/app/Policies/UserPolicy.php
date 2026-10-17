<?php

namespace App\Policies;

use App\Models\User;
use Illuminate\Auth\Access\Response;

/** Managers manage the reps in their own organization. The route's manage-team gate has already checked the role. */
class UserPolicy
{
    public function update(User $actor, User $target): Response
    {
        return $this->managesRep($actor, $target);
    }

    public function deactivate(User $actor, User $target): Response
    {
        return $this->managesRep($actor, $target);
    }

    private function managesRep(User $actor, User $target): Response
    {
        if ($target->org_id !== $actor->org_id) {
            return Response::denyAsNotFound();
        }
        if (! $actor->isManager() || $target->isManager()) {
            return Response::deny('Only reps can be changed here.');
        }
        if ($actor->organization->is_demo) {
            return Response::deny('Team changes are turned off in the demo.');
        }

        return Response::allow();
    }
}
