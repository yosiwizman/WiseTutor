#!/usr/bin/env python3
"""Test script to verify get_backend_host() function."""
import sys
import os
sys.path.insert(0, '.')

# Test 1: Default value (no env var)
if 'BACKEND_HOST' in os.environ:
    del os.environ['BACKEND_HOST']

from deeptutor.services.setup import get_backend_host

default_host = get_backend_host()
print(f"Test 1 - Default host (no env var): {default_host}")
assert default_host == "127.0.0.1", f"Expected 127.0.0.1, got {default_host}"
print("✓ PASS: Default is 127.0.0.1")

# Test 2: Override with env var
os.environ['BACKEND_HOST'] = '0.0.0.0'
# Need to reload to pick up env change
import importlib
import deeptutor.services.setup
importlib.reload(deeptutor.services.setup)
from deeptutor.services.setup import get_backend_host as get_backend_host_2

override_host = get_backend_host_2()
print(f"\nTest 2 - Override host (BACKEND_HOST=0.0.0.0): {override_host}")
assert override_host == "0.0.0.0", f"Expected 0.0.0.0, got {override_host}"
print("✓ PASS: Override works with BACKEND_HOST=0.0.0.0")

print("\n✓ All tests passed!")
