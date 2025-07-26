// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/**
 * @title VerifySignature
 * @author Duration.Finance
 * @notice EIP-712 signature verification for LP commitments
 * @dev Adapted from GHOptim but with Duration.Finance specific domain
 */
contract VerifySignature is EIP712 {
    using ECDSA for bytes32;

    bytes32 public constant OPTION_COMMITMENT_TYPEHASH = keccak256(
        "OptionCommitment(address lp,address taker,address asset,uint256 amount,uint256 targetPrice,uint256 premium,uint256 durationDays,uint8 optionType,uint256 expiry,uint256 nonce)"
    );

    constructor() EIP712("Duration.Finance", "1.0") {}

    /**
     * @notice Verify commitment signature (LP or Taker)
     * @param lp Liquidity provider address (0x0 for taker commitments)
     * @param taker Taker address (0x0 for LP commitments)
     * @param asset Underlying asset address
     * @param amount Amount of asset
     * @param targetPrice LP's target price (0 for taker commitments)
     * @param premium Taker's offered premium (0 for LP commitments)
     * @param durationDays Option duration in days
     * @param optionType Option type (CALL or PUT)
     * @param expiry Commitment expiry timestamp
     * @param nonce Unique nonce for commitment
     * @param signature EIP-712 signature
     * @return isValid True if signature is valid
     */
    function verifyCommitmentSignature(
        address lp,
        address taker,
        address asset,
        uint256 amount,
        uint256 targetPrice,
        uint256 premium,
        uint256 durationDays,
        uint8 optionType,
        uint256 expiry,
        uint256 nonce,
        bytes memory signature
    ) public view returns (bool isValid) {
        bytes32 digest = getCommitmentHash(
            lp,
            taker,
            asset,
            amount,
            targetPrice,
            premium,
            durationDays,
            optionType,
            expiry,
            nonce
        );
        
        address signer = digest.recover(signature);
        
        // Verify signer is either the LP or Taker (whoever is non-zero)
        if (lp != address(0)) {
            return signer == lp;
        } else {
            return signer == taker && taker != address(0);
        }
    }

    /**
     * @notice Get typed data hash for commitment
     * @param lp Liquidity provider address (0x0 for taker commitments)
     * @param taker Taker address (0x0 for LP commitments)
     * @param asset Underlying asset address
     * @param amount Amount of asset
     * @param targetPrice LP's target price (0 for taker commitments)
     * @param premium Taker's offered premium (0 for LP commitments)
     * @param durationDays Option duration in days
     * @param optionType Option type (CALL or PUT)
     * @param expiry Commitment expiry timestamp
     * @param nonce Unique nonce for commitment
     * @return hash Typed data hash for signing
     */
    function getCommitmentHash(
        address lp,
        address taker,
        address asset,
        uint256 amount,
        uint256 targetPrice,
        uint256 premium,
        uint256 durationDays,
        uint8 optionType,
        uint256 expiry,
        uint256 nonce
    ) public view returns (bytes32 hash) {
        bytes32 structHash = keccak256(
            abi.encode(
                OPTION_COMMITMENT_TYPEHASH,
                lp,
                taker,
                asset,
                amount,
                targetPrice,
                premium,
                durationDays,
                optionType,
                expiry,
                nonce
            )
        );

        return _hashTypedDataV4(structHash);
    }

    /**
     * @notice Get domain separator
     * @return Domain separator for EIP-712
     */
    function getDomainSeparator() public view returns (bytes32) {
        return _domainSeparatorV4();
    }

    /**
     * @notice Verify signature matches expected signer
     * @param hash Message hash
     * @param signature Signature bytes
     * @param expectedSigner Expected signer address
     * @return isValid True if signature is valid
     */
    function verifySignature(
        bytes32 hash,
        bytes memory signature,
        address expectedSigner
    ) public pure returns (bool isValid) {
        address signer = hash.recover(signature);
        return signer == expectedSigner && signer != address(0);
    }
}