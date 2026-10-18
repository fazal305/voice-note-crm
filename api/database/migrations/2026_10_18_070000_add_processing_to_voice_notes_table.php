<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * transcript, ai_payload and match_candidates hold encrypted strings (see the VoiceNote casts), so they are text
     * columns: an encrypted value is not valid JSON and PostgreSQL would refuse it in a json column.
     */
    public function up(): void
    {
        Schema::table('voice_notes', function (Blueprint $table) {
            $table->longText('transcript')->nullable();
            $table->longText('ai_payload')->nullable();
            $table->foreignId('suggested_client_id')->nullable()->constrained('clients')->nullOnDelete();
            $table->text('match_candidates')->nullable();
            $table->timestamp('processing_started_at')->nullable();
            $table->timestamp('processed_at')->nullable();
            $table->unsignedSmallInteger('attempts')->default(0);
        });
    }

    public function down(): void
    {
        Schema::table('voice_notes', function (Blueprint $table) {
            $table->dropConstrainedForeignId('suggested_client_id');
            $table->dropColumn(['transcript', 'ai_payload', 'match_candidates', 'processing_started_at', 'processed_at', 'attempts']);
        });
    }
};
