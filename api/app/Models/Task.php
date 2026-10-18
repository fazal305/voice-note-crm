<?php

namespace App\Models;

use App\Enums\TaskOwner;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

// Nothing is mass assignable: every column is set by the app from validated input or the signed-in user.
// The title is encrypted at rest, like the call log it usually comes from. due_at is a plain Y-m-d string: a
// calendar day, not a moment, so it compares the same in SQLite and PostgreSQL.
class Task extends Model
{
    protected $guarded = ['*'];

    protected function casts(): array
    {
        return [
            'title' => 'encrypted',
            'owner' => TaskOwner::class,
            'done_at' => 'datetime',
        ];
    }

    public function callLog(): BelongsTo
    {
        return $this->belongsTo(CallLog::class);
    }

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }

    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assignee_id');
    }
}
