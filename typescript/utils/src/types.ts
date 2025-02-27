import { ethers } from 'ethers';

/********* BASIC TYPES *********/
export type Domain = number;
export type Address = string;
export type AddressBytes32 = string;
export type HexString = string;

// copied from node_modules/@ethersproject/bytes/src.ts/index.ts
export type SignatureLike =
  | {
      r: string;
      s?: string;
      _vs?: string;
      recoveryParam?: number;
      v?: number;
    }
  | ethers.utils.BytesLike;

export type MerkleProof = {
  branch: ethers.utils.BytesLike[];
  leaf: ethers.utils.BytesLike;
  index: number;
};

/********* HYPERLANE CORE *********/
export type Checkpoint = {
  root: string;
  index: number; // safe because 2 ** 32 leaves < Number.MAX_VALUE
  mailbox_domain: Domain;
  mailbox_address: Address;
};

/**
 * Shape of a checkpoint in S3 as published by the agent.
 */
export type S3CheckpointWithId = {
  value: {
    checkpoint: Checkpoint;
    message_id: HexString;
  };
  signature: SignatureLike;
};

export type S3Checkpoint = {
  value: Checkpoint;
  signature: SignatureLike;
};

export type CallData = {
  to: Address;
  data: string;
};

export enum MessageStatus {
  NONE = 0,
  PROCESSED,
}

export type ParsedMessage = {
  version: number;
  nonce: number;
  origin: number;
  sender: string;
  destination: number;
  recipient: string;
  body: string;
};

export type ParsedLegacyMultisigIsmMetadata = {
  checkpointRoot: string;
  checkpointIndex: number;
  originMailbox: string;
  proof: ethers.utils.BytesLike[];
  signatures: ethers.utils.BytesLike[];
  validators: ethers.utils.BytesLike[];
};

export enum InterchainSecurityModuleType {
  MULTISIG = 3,
}
