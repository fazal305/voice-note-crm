<?php

namespace App\Models;

use App\Enums\Sentiment;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

// Nothing is mass assignable: every column is set by the app from validated input or the signed-in user.
// The summary is encrypted at rest (NFR-5.3). follow_up_at is a plain Y-m-d string: a calendar day, not a moment.
class CallLog extends Model
{
    protected $guarded = ['*'];

    protected function casts(): array
    {
        return [
            'summary' => 'encrypted',
            'sentiment' => Sentiment::class,
        ];
    }

    /**
     * The logs a user may read: a manager, the whole organization's; a rep, the ones they saved or that were saved
     * from their own notes (a manager can save a log for a rep's note). Same rule as CallLogPolicy::view().
     */
    public function scopeVisibleTo(Builder $query, User $user): void
    {
        $query->where('call_logs.org_id', $user->org_id);
        if (! $user->isManager()) {
            $query->where(fn (Builder $q) => $q->where('call_logs.user_id', $user->id)
                ->orWhereIn('call_logs.voice_note_id', VoiceNote::select('id')->where('user_id', $user->id)));
        }
    }

    public function voiceNote(): BelongsTo
    {
        return $this->belongsTo(VoiceNote::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }

    public function tasks(): HasMany
    {
        return $this->hasMany(Task::class)->orderBy('id');
    }
}
