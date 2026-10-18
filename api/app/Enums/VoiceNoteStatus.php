<?php

namespace App\Enums;

enum VoiceNoteStatus: string
{
    case Uploaded = 'uploaded';
    case Transcribing = 'transcribing';
    // No speech-to-text service is configured: the note waits for a transcript typed or pasted by the user.
    case AwaitingTranscript = 'awaiting_transcript';
    case Parsing = 'parsing';
    case Ready = 'ready';
    case Failed = 'failed';
}
