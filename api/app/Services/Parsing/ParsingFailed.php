<?php

namespace App\Services\Parsing;

use RuntimeException;

/** Details are for the logs only; the note falls back to rule-based parsing. */
class ParsingFailed extends RuntimeException {}
