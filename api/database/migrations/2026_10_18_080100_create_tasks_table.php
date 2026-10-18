<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * title is encrypted (see the Task casts): it is usually taken from the call, so it can name the client and
     * what was agreed. Tasks are therefore filtered and sorted by their dates, never searched by title.
     */
    public function up(): void
    {
        Schema::create('tasks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('org_id')->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('call_log_id')->nullable()->constrained('call_logs')->nullOnDelete();
            $table->foreignId('client_id')->nullable()->constrained('clients')->nullOnDelete();
            $table->foreignId('assignee_id')->constrained('users')->cascadeOnDelete();
            $table->text('title');
            $table->string('owner', 10);
            $table->date('due_at')->nullable();
            $table->timestamp('done_at')->nullable();
            $table->timestamps();

            $table->index(['assignee_id', 'done_at', 'due_at']);
            $table->index(['org_id', 'client_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tasks');
    }
};
