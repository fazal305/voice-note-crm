<?php

namespace App\Enums;

enum VoiceNoteStatus: string
{
    case Uploaded = 'uploaded';
    case Transcribing = 'transcribing';
    case Parsing = 'parsing';
    case Ready = 'ready';
    case Failed = 'failed';
}
