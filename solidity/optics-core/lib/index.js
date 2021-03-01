require('@nomiclabs/hardhat-waffle');
const { assert } = require('chai');
const ethers = require('ethers');
const { extendEnvironment } = require('hardhat/config');

const HomeAbi = require('../../../abis/Home.abi.json');
const ReplicaAbi = require('../../../abis/ProcessingReplica.abi.json');

extendEnvironment((hre) => {
  const State = {
    ACTIVE: 0,
    FAILED: 1,
  };

  const MessageStatus = {
    NONE: 0,
    PENDING: 1,
    PROCESSED: 2,
  };

  class Common extends ethers.Contract {
    constructor(address, abi, providerOrSigner) {
      super(address, abi, providerOrSigner);
    }

    async submitDoubleUpdate(left, right) {
      if (left.oldRoot !== right.oldRoot) {
        throw new Error('Old roots do not match');
      }
      return await this.doubleUpdate(
        right.oldRoot,
        [left.newRoot, right.newRoot],
        left.signature,
        right.signature,
      );
    }
  }

  class Home extends Common {
    constructor(address, providerOrSigner) {
      super(address, HomeAbi, providerOrSigner);
    }

    async submitSignedUpdate(update) {
      return await this.update(
        update.oldRoot,
        update.newRoot,
        update.signature,
      );
    }

    // Returns list of Dispatch events with given destination and sequence
    async dispatchByDestinationAndSequence(destination, sequence) {
      const filter = this.filters.Dispatch(
        null,
        destinationAndSequence(destination, sequence),
      );

      return await this.queryFilter(filter);
    }
  }

  class Replica extends Common {
    constructor(address, providerOrSigner) {
      super(address, ReplicaAbi, providerOrSigner);
    }

    async submitSignedUpdate(update) {
      return await this.update(
        update.oldRoot,
        update.newRoot,
        update.signature,
      );
    }
  }

  class Updater {
    constructor(signer, address, originDomain, disableWarn) {
      if (!disableWarn) {
        throw new Error('Please use `Updater.fromSigner()` to instantiate.');
      }
      this.originDomain = originDomain ? originDomain : 0;
      this.signer = signer;
      this.address = address;
    }

    static async fromSigner(signer, originDomain) {
      return new Updater(signer, await signer.getAddress(), originDomain, true);
    }

    domain() {
      return ethers.utils.solidityKeccak256(
        ['uint32', 'string'],
        [this.originDomain, 'OPTICS'],
      );
    }

    message(oldRoot, newRoot) {
      return ethers.utils.concat([this.domain(), oldRoot, newRoot]);
    }

    async signUpdate(oldRoot, newRoot) {
      let message = this.message(oldRoot, newRoot);
      let msgHash = ethers.utils.arrayify(ethers.utils.keccak256(message));
      let signature = await this.signer.signMessage(msgHash);
      return {
        origin: this.originDomain,
        oldRoot,
        newRoot,
        signature,
      };
    }
  }

  const getHomeFactory = async (...args) =>
    ethers.getContractFactory('Home', ...args);
  const getReplicaFactory = async (...args) =>
    ethers.getContractFactory('ProcessingReplica', ...args);

  const formatMessage = (
    originDomain,
    senderAddr,
    sequence,
    destinationDomain,
    recipientAddr,
    body,
  ) => {
    senderAddr = optics.ethersAddressToBytes32(senderAddr);
    recipientAddr = optics.ethersAddressToBytes32(recipientAddr);

    return ethers.utils.solidityPack(
      ['uint32', 'bytes32', 'uint32', 'uint32', 'bytes32', 'bytes'],
      [
        originDomain,
        senderAddr,
        sequence,
        destinationDomain,
        recipientAddr,
        body,
      ],
    );
  };

  const messageToLeaf = (message) => {
    return ethers.utils.solidityKeccak256(['bytes'], [message]);
  };

  const ethersAddressToBytes32 = (address) => {
    return ethers.utils
      .hexZeroPad(ethers.utils.hexStripZeros(address), 32)
      .toLowerCase();
  };

  const destinationAndSequence = (destination, sequence) => {
    assert(destination < Math.pow(2, 32) - 1);
    assert(sequence < Math.pow(2, 32) - 1);

    return ethers.BigNumber.from(destination)
      .mul(ethers.BigNumber.from(2).pow(32))
      .add(ethers.BigNumber.from(sequence));
  };

  hre.optics = {
    State,
    MessageStatus,
    Common,
    Home,
    Replica,
    Updater,
    formatMessage,
    messageToLeaf,
    ethersAddressToBytes32,
    destinationAndSequence,
    getHomeFactory,
    getReplicaFactory,
    deployHome: async (signer, ...args) => {
      let contract = await (await getHomeFactory(signer)).deploy(...args);
      await contract.deployed();
      return new Home(contract.address, signer);
    },
    deployReplica: async (signer, ...args) => {
      let contract = await (await getReplicaFactory(signer)).deploy(...args);
      await contract.deployed();
      return new Replica(contract.address, signer);
    },
  };
});