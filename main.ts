import cluster, { Worker } from 'cluster';
import fs from 'fs';
import { MerkleTree } from 'merkletreejs';
import keccak256 from 'keccak256';

const fileNames: string[] = ['walletList.txt'];

if (cluster.isMaster) {
  fileNames.forEach((fileName: string) => {
    const worker: Worker = cluster.fork();
    worker.send(fileName);
  });

  cluster.on('message', (worker: Worker, message: any) => {
    const { addresses }: { addresses: string[] } = message;
    const leafNodes = addresses.map((address: string) => {
      const bufferAddress = Buffer.from(address.replace(/^0x/, ''), 'hex');
      return keccak256(bufferAddress);
    });

    const merkleTree = new MerkleTree(leafNodes, keccak256, { sortPairs: true });
    const rootHash = merkleTree.getHexRoot();

    const stream = fs.createWriteStream(`${worker.id}_output.json`);

    stream.write('{"rootHash":"' + rootHash + '","wallets":[');

    const totalAddresses = addresses.length;
    let completedCount = 0;

    addresses.forEach((address: string, index: number) => {
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
  process.on('message', (fileName: string) => {
    const addresses = readFromFile(fileName);
    process.send({ addresses });
  });

  function readFromFile(fileName: string): string[] {
    const addresses = fs.readFileSync(fileName, 'utf-8').split('\n').filter((address: string) => address);
    return addresses;
  }
}
