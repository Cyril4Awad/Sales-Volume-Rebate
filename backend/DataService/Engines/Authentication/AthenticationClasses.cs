using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace DataService.Engines.Authentication
{
    public class BasicRegisterRequest
    {
        public string Id { get; set; }                    // Unique credential ID
        public string Type { get; set; }                  // Always "public-key"
        public string RawId { get; set; }                 // Raw credential ID bytes
        public BasicRegisterResponse Response { get; set; } // Contains attestation object
    }

    public class BasicRegisterResponse
    {
        public string AttestationObject { get; set; }     // CBOR encoded attestation data
        public string ClientDataJSON { get; set; }        // Client data (challenge, origin, etc.)
    }

    public class BasicVerifyRequest
    {
        public string Id { get; set; }                    // Credential ID to verify
        public string Type { get; set; }                  // Always "public-key"
        public string RawId { get; set; }                 // Raw credential ID bytes
        public BasicVerifyResponse Response { get; set; } // Contains assertion data
    }

    public class BasicVerifyResponse
    {
        public string AuthenticatorData { get; set; }     // Authenticator data (flags, sign count)
        public string ClientDataJSON { get; set; }        // Client data (challenge, origin, etc.)
        public string Signature { get; set; }             // Cryptographic signature
        public string UserHandle { get; set; }            // Optional user identifier
    }

    // Data model for storing credentials
    public class StoredCredential
    {
        public string Id { get; set; }                    // Unique credential identifier
        public string Type { get; set; }                  // Credential type
        public byte[] PublicKey { get; set; }             // Extracted public key bytes
        public uint SignCount { get; set; }               // Signature counter for replay protection
        public DateTime CreatedAt { get; set; }           // Registration timestamp
    }

    // Client data model (parsed from clientDataJSON)
    public class ClientData
    {
        public string Type { get; set; }                  // Operation type ("webauthn.create" or "webauthn.get")
        public string Challenge { get; set; }             // Challenge string to prevent replay attacks
        public string Origin { get; set; }                // Origin URL for security verification
        public bool CrossOrigin { get; set; }             // Cross-origin flag
    }
}
