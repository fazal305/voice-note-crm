<?php

namespace App\Policies;

use App\Models\Task;
use App\Models\User;
use Illuminate\Auth\Access\Response;

class TaskPolicy
{
    public function update(User $user, Task $task): Response
    {
        return $this->assigneeOrManager($user, $task);
    }

    public function delete(User $user, Task $task): Response
    {
        return $this->assigneeOrManager($user, $task);
    }

    // A rep's tasks are private to them; a manager sees the whole organization. Anything else answers 404.
    private function assigneeOrManager(User $user, Task $task): Response
    {
        if ($task->org_id !== $user->org_id) {
            return Response::denyAsNotFound();
        }

        return $task->assignee_id === $user->id || $user->isManager() ? Response::allow() : Response::denyAsNotFound();
    }
}
