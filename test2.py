import requests
import time
import json
import re

# =================================================================================================
# Python WhatsApp Sender — One message per number
# =================================================================================================
# What it does:
# - Sends the MESSAGE exactly once to each number in PHONE_NUMBERS
# - Deduplicates numbers and strips non-digits
# - Adds a delay between sends to reduce spam risk
# - Prints a summary at the end
# =================================================================================================

# --- Configuration ---

# The base URL of your running Node.js WhatsApp API server
API_URL = "http://localhost:3000/send_message"

# The session_token you received from the /check_status endpoint
# IMPORTANT: Keep this token secure and do not share it publicly.
SESSION_TOKEN = "REPLACE_WITH_YOUR_SESSION_TOKEN"

# List of numbers to send to (international format without '+' or '00')
PHONE_NUMBERS = [
    "573188150574",
    # "919876543210",
    # "15551234567",
]

# The message you want to send.
MESSAGE = "Hello! This is a single-send test message from the Python script."

# Delay between recipients in seconds
DELAY_BETWEEN_RECIPIENTS = 1


# --- Helpers ---

def normalize_number(num: str) -> str:
    """
    Keep digits only. You should already supply numbers without '+' or '00',
    but this makes things a bit more robust.
    """
    return re.sub(r"\D", "", num or "")

def unique_normalized_numbers(numbers):
    """
    Normalize and de-duplicate while preserving order.
    """
    seen = set()
    cleaned = []
    for n in numbers:
        nn = normalize_number(n)
        if nn and nn not in seen:
            seen.add(nn)
            cleaned.append(nn)
    return cleaned


# --- Core ---

def send_message(phone_number: str, message_text: str) -> bool:
    """
    Sends a single WhatsApp message using the API.
    Returns True on success, False otherwise.
    """
    headers = {
        "Authorization": f"Bearer {SESSION_TOKEN}"
    }

    # Many Node servers expect JSON; if yours expects form-encoded,
    # switch back to: requests.post(API_URL, headers=headers, data=payload)
    payload = {
        "phoneNumber": phone_number,
        "message": message_text
    }

    print(f"[*] Sending to {phone_number} ...")
    try:
        # If your API expects JSON body:
        response = requests.post(API_URL, headers=headers, json=payload, timeout=30)
        response.raise_for_status()

        # Try to print JSON response nicely; fall back if not JSON.
        try:
            response_data = response.json()
            print(f"[+] Success: {json.dumps(response_data)}")
        except ValueError:
            print(f"[+] Success (non-JSON response): {response.text[:200]}")

        return True

    except requests.exceptions.HTTPError as http_err:
        print(f"[!] HTTP error: {http_err}")
        try:
            print(f"    Body: {response.text[:500]}")
        except Exception:
            pass
    except requests.exceptions.RequestException as req_err:
        print(f"[!] Request error: {req_err}")
    except Exception as e:
        print(f"[!] Unexpected error: {e}")

    return False


def main():
    print("--- Starting WhatsApp Single-Send ---")

    if not all([API_URL, SESSION_TOKEN, PHONE_NUMBERS, MESSAGE]):
        print("[!] Error: Please fill in all configuration variables.")
        return

    targets = unique_normalized_numbers(PHONE_NUMBERS)
    if not targets:
        print("[!] Error: No valid phone numbers after normalization.")
        return

    print(f"[*] Total unique recipients: {len(targets)}")
    successful, failed = 0, 0

    for idx, number in enumerate(targets, start=1):
        print(f"\n--- {idx}/{len(targets)} ---")
        if send_message(number, MESSAGE):
            successful += 1
        else:
            failed += 1

        if idx < len(targets):
            print(f"[*] Waiting {DELAY_BETWEEN_RECIPIENTS}s before next send...")
            time.sleep(DELAY_BETWEEN_RECIPIENTS)

    print("\n--- Sending Complete ---")
    print(f"Total Recipients: {len(targets)}")
    print(f"Sent Successfully: {successful}")
    print(f"Failed: {failed}")
    print("------------------------")


if __name__ == "__main__":
    main()
