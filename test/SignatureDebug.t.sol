// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../contracts/DurationOptions.sol";

contract SignatureDebugTest is Test {
    DurationOptions public durationOptions;
    
    address constant USDC_BASE_SEPOLIA = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
    address constant WETH_BASE_SEPOLIA = 0x4200000000000000000000000000000000000006;
    address constant ONEINCH_ROUTER = 0x111111125421cA6dc452d289314280a0f8842A65;
    
    address owner = address(0x1);
    
    uint256 lpPrivateKey = 0x123456789abcdef123456789abcdef123456789abcdef123456789abcdef1234;
    address lp = vm.addr(lpPrivateKey);
    
    function setUp() public {
        vm.createSelectFork("https://sepolia.base.org");
        
        durationOptions = new DurationOptions(
            USDC_BASE_SEPOLIA,
            WETH_BASE_SEPOLIA, 
            ONEINCH_ROUTER,
            owner
        );
    }
    
    function testDebugSignatureWithActualData() public {
        console.log("=== DEBUGGING SIGNATURE WITH ACTUAL TRANSACTION DATA ===");
        
        // Use the exact same data from the failing transaction
        DurationOptions.Commitment memory commitment = DurationOptions.Commitment({
            creator: 0xE7b30A037F5598E4e73702ca66A59Af5CC650Dcd,
            asset: WETH_BASE_SEPOLIA,
            amount: 100000000000000000, // 0.1 ETH
            dailyPremiumUsdc: 1000000, // $1 USDC
            minLockDays: 1,
            maxDurationDays: 7,
            optionType: 0, // CALL
            commitmentType: DurationOptions.CommitmentType.OFFER,
            expiry: 1754320051,
            nonce: 730897
        });
        
        // The actual signature from the transaction
        bytes memory actualSignature = hex"f366c9ea47bc9ca95145b43ad83448171a98fc60317bd53b72d366c81da3c4042cb252ba9d040b3d95983e9f159d36a48b4a8341ef748c48fadf15fa13b299d11c";
        
        console.log("Creator Address:", commitment.creator);
        console.log("Asset:", commitment.asset);
        console.log("Amount:", commitment.amount);
        console.log("Daily Premium USDC:", commitment.dailyPremiumUsdc);
        console.log("Min Lock Days:", commitment.minLockDays);
        console.log("Max Duration Days:", commitment.maxDurationDays);
        console.log("Option Type:", commitment.optionType);
        console.log("Expiry:", commitment.expiry);
        console.log("Nonce:", commitment.nonce);
        
        // Test signature verification
        bool isValid = durationOptions.verifyCommitmentSignature(commitment, actualSignature);
        console.log("Signature valid:", isValid);
        
        // Let's create a correct signature for this data
        bytes memory correctSignature = _signCommitment(commitment, lpPrivateKey);
        console.log("Correct signature length:", correctSignature.length);
        console.logBytes(correctSignature);
        
        // Test the correct signature
        bool correctIsValid = durationOptions.verifyCommitmentSignature(commitment, correctSignature);
        console.log("Correct signature valid:", correctIsValid);
        
        // Let's see what address the actual signature recovers to
        bytes32 structHash = keccak256(abi.encode(
            keccak256("Commitment(address creator,address asset,uint256 amount,uint256 dailyPremiumUsdc,uint256 minLockDays,uint256 maxDurationDays,uint8 optionType,uint8 commitmentType,uint256 expiry,uint256 nonce)"),
            commitment.creator,
            commitment.asset,
            commitment.amount,
            commitment.dailyPremiumUsdc,
            commitment.minLockDays,
            commitment.maxDurationDays,
            commitment.optionType,
            uint8(commitment.commitmentType),
            commitment.expiry,
            commitment.nonce
        ));
        
        bytes32 domainSeparator = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256("DurationOptions"),
            keccak256("1.0"),
            block.chainid,
            address(durationOptions)
        ));
        
        bytes32 digest = keccak256(abi.encodePacked(
            "\x19\x01",
            domainSeparator,
            structHash
        ));
        
        console.log("Expected digest:");
        console.logBytes32(digest);
        
        // Try to recover the address from the actual signature
        address recovered = ECDSA.recover(digest, actualSignature);
        console.log("Recovered address from actual signature:", recovered);
        console.log("Expected creator address:", commitment.creator);
        console.log("Addresses match:", recovered == commitment.creator);
    }
    
    function _signCommitment(
        DurationOptions.Commitment memory commitment,
        uint256 privateKey
    ) internal view returns (bytes memory) {
        bytes32 COMMITMENT_TYPEHASH = keccak256(
            "Commitment(address creator,address asset,uint256 amount,uint256 dailyPremiumUsdc,uint256 minLockDays,uint256 maxDurationDays,uint8 optionType,uint8 commitmentType,uint256 expiry,uint256 nonce)"
        );
        
        bytes32 structHash = keccak256(abi.encode(
            COMMITMENT_TYPEHASH,
            commitment.creator,
            commitment.asset,
            commitment.amount,
            commitment.dailyPremiumUsdc,
            commitment.minLockDays,
            commitment.maxDurationDays,
            commitment.optionType,
            uint8(commitment.commitmentType),
            commitment.expiry,
            commitment.nonce
        ));
        
        bytes32 domainSeparator = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256("DurationOptions"),
            keccak256("1.0"),
            block.chainid,
            address(durationOptions)
        ));
        
        bytes32 digest = keccak256(abi.encodePacked(
            "\x19\x01",
            domainSeparator,
            structHash
        ));
        
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        return abi.encodePacked(r, s, v);
    }
}