<?php

namespace App\Policies;

use App\Models\Client;
use App\Models\User;
use Illuminate\Auth\Access\Response;

class ClientPolicy
{
    public function view(User $user, Client $client): Response
    {
        return $this->sameOrg($user, $client);
    }

    public function update(User $user, Client $client): Response
    {
        return $this->sameOrg($user, $client);
    }

    public function delete(User $user, Client $client): Response
    {
        $access = $this->sameOrg($user, $client);
        if ($access->denied()) {
            return $access;
        }

        return $user->isManager() ? Response::allow() : Response::deny('Only a manager can delete clients.');
    }

    // Other organizations' records answer 404, so their existence isn't revealed.
    private function sameOrg(User $user, Client $client): Response
    {
        return $client->org_id === $user->org_id ? Response::allow() : Response::denyAsNotFound();
    }
}
