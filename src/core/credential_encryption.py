"""
Simple credential encryption for authentication data.
Uses base64 encoding with XOR obfuscation for basic protection.
Note: For true security, use a proper encryption library like cryptography.Fernet.
"""
import base64
import os
import json


# Simple XOR key derived from machine-specific data
def _get_machine_key():
    """Get a machine-specific key for obfuscation"""
    try:
        # Use username + machine name as seed for key
        username = os.environ.get('USERNAME', os.environ.get('USER', 'default'))
        machine = os.environ.get('COMPUTERNAME', os.environ.get('HOSTNAME', 'default'))
        seed = f"{username}:{machine}"
        # Create a repeating key from the seed
        key_bytes = seed.encode('utf-8')
        # Extend to 256 bytes
        key = (key_bytes * (256 // len(key_bytes) + 1))[:256]
        return key
    except:
        return b'WailingNewtDefaultKey1234567890' * 8


def _xor_bytes(data, key):
    """XOR data with key"""
    result = bytearray(len(data))
    key_len = len(key)
    for i, byte in enumerate(data):
        result[i] = byte ^ key[i % key_len]
    return bytes(result)


def encrypt_credential(plaintext):
    """
    Encrypt a credential string.
    
    Args:
        plaintext: The credential to encrypt (string)
        
    Returns:
        str: Base64-encoded encrypted string
    """
    if not plaintext:
        return ''
    
    try:
        key = _get_machine_key()
        data = plaintext.encode('utf-8')
        encrypted = _xor_bytes(data, key)
        return base64.b64encode(encrypted).decode('ascii')
    except Exception as e:
        print(f"Encryption error: {e}")
        return plaintext  # Fallback to plaintext on error


def decrypt_credential(encrypted):
    """
    Decrypt a credential string.
    
    Args:
        encrypted: The encrypted credential (base64 string)
        
    Returns:
        str: Decrypted plaintext
    """
    if not encrypted:
        return ''
    
    try:
        key = _get_machine_key()
        data = base64.b64decode(encrypted.encode('ascii'))
        decrypted = _xor_bytes(data, key)
        return decrypted.decode('utf-8')
    except Exception as e:
        # If decryption fails, it might be plaintext
        return encrypted


def encrypt_auth_data(auth_data):
    """
    Encrypt passwords in authentication data.
    
    Args:
        auth_data: List of auth entries with 'password' fields
        
    Returns:
        list: Auth data with encrypted passwords
    """
    if not auth_data:
        return []
    
    result = []
    for entry in auth_data:
        encrypted_entry = entry.copy()
        if 'password' in encrypted_entry and encrypted_entry['password']:
            encrypted_entry['password'] = encrypt_credential(encrypted_entry['password'])
            encrypted_entry['_encrypted'] = True
        result.append(encrypted_entry)
    return result


def decrypt_auth_data(auth_data):
    """
    Decrypt passwords in authentication data.
    
    Args:
        auth_data: List of auth entries with encrypted 'password' fields
        
    Returns:
        list: Auth data with decrypted passwords
    """
    if not auth_data:
        return []
    
    result = []
    for entry in auth_data:
        decrypted_entry = entry.copy()
        if decrypted_entry.get('_encrypted') and 'password' in decrypted_entry:
            decrypted_entry['password'] = decrypt_credential(decrypted_entry['password'])
            del decrypted_entry['_encrypted']
        result.append(decrypted_entry)
    return result
