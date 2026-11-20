package com.acme.ledger;

import com.acme.ledger.core.Ledger;

public class App {
    public static void main(String[] args) {
        System.out.println(new Ledger().balance());
    }
}
