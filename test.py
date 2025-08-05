import requests
import time
import json

# =================================================================================================
# Python Bulk WhatsApp Sender
# =================================================================================================
# This script sends a specified number of messages to a target WhatsApp number using the
# Node.js WhatsApp API you have running.
#
# How to use:
# 1. Make sure your Node.js WhatsApp server is running.
# 2. Update the `API_URL`, `SESSION_TOKEN`, and `PHONE_NUMBERS` variables below.
# 3. Run the script: python your_script_name.py
# =================================================================================================

# --- Configuration ---

# The base URL of your running Node.js WhatsApp API server
API_URL = "http://localhost:3000/send_message"

# The session_token you received from the /check_status endpoint
# IMPORTANT: Keep this token secure and do not share it publicly.
SESSION_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzZXNzaW9uSWQiOiJzZXNzaW9uLTE3NTQ0MTMwODM5NzAiLCJpYXQiOjE3NTQ0MTMxNDEsImV4cCI6MTc1NDQ5OTU0MX0.TkzrCV7RPiWrd8UI28MJ1jelAgLvMkPr0zU9VGsdK30"

# The phone number to send the message to.
# The script will use the first number in this list as the target.
# Use the international format without '+' or '00'. For example: '919876543210' for an Indian number.
PHONE_NUMBERS = [
    "573188150574",  # Target number
]

# The message you want to send.
MESSAGE = "Hello! This is a bulk test message from the Python script."

# Delay between messages in seconds to avoid being flagged as spam.
# A delay of 5-15 seconds is generally recommended.
DELAY_BETWEEN_MESSAGES = 1

def send_message(phone_number, message_text):
    """
    Sends a single WhatsApp message using the API.

    Args:
        phone_number (str): The recipient's phone number.
        message_text (str): The text message to send.

    Returns:
        bool: True if the message was sent successfully, False otherwise.
    """
    headers = {
        "Authorization": f"Bearer {SESSION_TOKEN}"
    }
    payload = {
        "phoneNumber": phone_number,
        "message": message_text
    }

    print(f"[*] Sending message to: {phone_number}...")

    try:
        response = requests.post(API_URL, headers=headers, data=payload)
        response.raise_for_status()  # Raise an exception for bad status codes (4xx or 5xx)
        
        response_data = response.json()
        print(f"[+] Success! Response: {json.dumps(response_data)}")
        return True

    except requests.exceptions.HTTPError as http_err:
        print(f"[!] HTTP Error occurred: {http_err}")
        print(f"    Response Body: {response.text}")
    except requests.exceptions.RequestException as req_err:
        print(f"[!] A request error occurred: {req_err}")
    except Exception as e:
        print(f"[!] An unexpected error occurred: {e}")
        
    return False

def main():
    """
    Main function to loop and send 50 messages to the target number.
    """
    print("--- Starting Bulk WhatsApp Message Sender ---")
    
    if not all([API_URL, SESSION_TOKEN, PHONE_NUMBERS, MESSAGE]):
        print("[!] Error: Please fill in all the configuration variables at the top of the script.")
        return

    if not PHONE_NUMBERS:
        print("[!] Error: The PHONE_NUMBERS list is empty. Please add a target number.")
        return

    target_number = PHONE_NUMBERS[0]  # Using the first number in the list
    number_of_messages = 10
    
    print(f"[*] Target number: {target_number}")
    print(f"[*] Number of messages to send: {number_of_messages}")

    successful_sends = 0
    failed_sends = 0

    for i in range(number_of_messages):
        print(f"\n--- Sending message {i + 1}/{number_of_messages} ---")
        # You could customize the message for each iteration if you want, for example:
        # customized_message = f"{MESSAGE} (Message #{i+1})"
        if send_message(target_number, MESSAGE):
            successful_sends += 1
        else:
            failed_sends += 1
        
        # Wait before sending the next message, but not after the last one
        if i < number_of_messages - 1:
            print(f"[*] Waiting for {DELAY_BETWEEN_MESSAGES} seconds...")
            time.sleep(DELAY_BETWEEN_MESSAGES)

    print("\n--- Bulk Sending Complete ---")
    print(f"Total Messages Sent: {successful_sends}")
    print(f"Total Messages Failed: {failed_sends}")
    print("-----------------------------")


if __name__ == "__main__":
    main()
