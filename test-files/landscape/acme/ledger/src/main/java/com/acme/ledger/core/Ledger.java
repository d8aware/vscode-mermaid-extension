package com.acme.ledger.core;

import java.util.List;

public class Ledger {
    private final List<Entry> entries = List.of();
    public long balance() { return entries.size(); }
}
