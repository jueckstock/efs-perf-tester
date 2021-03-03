#!/usr/bin/awk -f
{
    print "{\"url\": \"" $1 "\", \"policy\":\"vanilla\"}"
    print "{\"url\": \"" $1 "\", \"policy\":\"page-length\"}"
    print "{\"url\": \"" $1 "\", \"policy\":\"split-key\"}"
    print "{\"url\": \"" $1 "\", \"policy\":\"block3p\"}"
}