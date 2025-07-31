// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/**
 * @title SignatureVerification
 * @author Duration.Finance
 * @notice EIP-712 signature verification for duration-centric commitments
 */
library SignatureVerification {
    
    // Domain separator for EIP-712
    bytes32 public constant DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );
    
    // Updated type hash for duration-centric LP commitments
    bytes32 public constant LP_COMMITMENT_TYPEHASH = keccak256(
        "LPCommitment(address lp,address asset,uint256 amount,uint256 dailyPremiumUsdc,uint256 minLockDays,uint256 maxDurationDays,uint8 optionType,uint256 expiry,uint256 nonce,bool isFramentable)"
    );
    
    /**
     * @dev Verify LP commitment signature
     * @param commitment The LP commitment struct
     * @param domainSeparator The EIP-712 domain separator
     * @return True if signature is valid
     */
    function verifyLPCommitment(
        LPCommitment memory commitment,
        bytes32 domainSeparator
    ) internal pure returns (bool) {
        bytes32 structHash = keccak256(
            abi.encode(
                LP_COMMITMENT_TYPEHASH,
                commitment.lp,
                commitment.asset,
                commitment.amount,
                commitment.dailyPremiumUsdc,
                commitment.minLockDays,
                commitment.maxDurationDays,
                uint8(commitment.optionType),
                commitment.expiry,
                commitment.nonce,
                commitment.isFramentable
            )
        );
        
        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", domainSeparator, structHash)
        );
        
        address signer = recoverSigner(digest, commitment.signature);
        return signer == commitment.lp && signer != address(0);
    }
    
    /**
     * @dev Recover signer from signature
     * @param digest The message digest
     * @param signature The signature bytes
     * @return The recovered signer address
     */
    function recoverSigner(bytes32 digest, bytes memory signature) internal pure returns (address) {
        require(signature.length == 65, "Invalid signature length");
        
        bytes32 r;
        bytes32 s;
        uint8 v;
        
        assembly {
            r := mload(add(signature, 32))
            s := mload(add(signature, 64))
            v := byte(0, mload(add(signature, 96)))
        }
        
        if (v < 27) {
            v += 27;
        }
        
        require(v == 27 || v == 28, "Invalid signature v value");
        
        return ecrecover(digest, v, r, s);
    }
    
    /**
     * @dev Generate domain separator
     * @param contractAddress The contract address
     * @return The domain separator hash
     */
    function buildDomainSeparator(address contractAddress) internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                DOMAIN_TYPEHASH,
                keccak256(bytes("Duration.Finance")),
                keccak256(bytes("1")),
                block.chainid,
                contractAddress
            )
        );
    }
}

// Struct definition for consistency (should match interface)
struct LPCommitment {
    address lp;                    // Liquidity provider address
    address asset;                 // Underlying asset address (initially WETH)
    uint256 amount;                // Amount of asset (full amount, no fractions)
    uint256 dailyPremiumUsdc;      // LP daily premium rate in USDC
    uint256 minLockDays;           // LP minimum lock period in days
    uint256 maxDurationDays;       // LP maximum duration in days
    uint8 optionType;              // CALL (0) or PUT (1)
    uint256 expiry;                // Commitment expiration timestamp  
    uint256 nonce;                 // Nonce for signature uniqueness
    bool isFramentable;            // Allow partial taking
    bytes signature;               // EIP-712 signature
}