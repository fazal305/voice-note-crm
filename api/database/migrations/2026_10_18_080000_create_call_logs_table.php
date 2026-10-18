<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * summary holds an encrypted string (see the CallLog casts), so it is a text column. A client with saved logs
     * can't be deleted (restrict), so call history is never lost by removing a client.
     */
    public function up(): void
    {
        Schema::create('call_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('org_id')->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('voice_note_id')->unique()->constrained('voice_notes')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('client_id')->constrained('clients')->restrictOnDelete();
            $table->text('summary');
            $table->string('sentiment', 20);
            $table->date('follow_up_at')->nullable();
            $table->string('follow_up_phrase', 120)->nullable();
            $table->timestamps();

            $table->index(['org_id', 'client_id', 'created_at']);
            $table->index(['user_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('call_logs');
    }
};
