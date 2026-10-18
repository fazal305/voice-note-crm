<?php

namespace App\Services\Transcription;

use RuntimeException;
use Throwable;

/** Details are for the logs only; users see a generic message. */
class TranscriptionFailed extends RuntimeException
{
    public function __construct(string $message, public readonly bool $retryable = true, ?Throwable $previous = null)
    {
        parent::__construct($message, 0, $previous);
    }
}
