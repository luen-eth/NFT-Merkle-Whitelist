const cluster = require('cluster');
const fs = require('fs');
const { MerkleTree } = require('merkletreejs');
const keccak256 = require('keccak256');

const fileNames = ['walletList.txt'];

if (cluster.isMaster) {
  fileNames.forEach(fileName => {
    const worker = cluster.fork();
    worker.send(fileName);
  });
  cluster.on('message', (worker, message) => {
    const { addresses } = message;
    const leafNodes = addresses.map(address => {
      const bufferAddress = Buffer.from(address.replace(/^0x/, ''), 'hex');
      return keccak256(bufferAddress);
    });

    const merkleTree = new MerkleTree(leafNodes, keccak256, { sortPairs: true });
    const rootHash = merkleTree.getHexRoot();

    const stream = fs.createWriteStream(`${worker.id}_output.json`);

    stream.write('{"rootHash":"' + rootHash + '","wallets":[');

    const totalAddresses = addresses.length;
    let completedCount = 0;

    addresses.forEach((address, index) => {
      const bufferAddress = Buffer.from(address.replace(/^0x/, ''), 'hex');
      const leaf = keccak256(bufferAddress);
      const proof = merkleTree.getHexProof(leaf);
      const wallet = {
        address: address,
        proof: proof
      };

      const suffix = (index !== addresses.length - 1) ? ',' : '';

      stream.write(JSON.stringify(wallet) + suffix);
      completedCount++;
      
      if (completedCount === totalAddresses) {
        console.log('Successfull !');
      } else {
        const progress = ((completedCount / totalAddresses) * 100).toFixed(2);
        console.log(`Processing: ${progress}%`);
      };
    });

    stream.write(']}');
    stream.end();
  });

} else {
  process.on('message', (fileName) => {
    const addresses = readFromFile(fileName);
    process.send({ addresses });
  });

  function readFromFile(fileName) {
    const addresses = fs.readFileSync(fileName, 'utf-8').split('\n').filter(address => address);
    return addresses;
  }
}
