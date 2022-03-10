import {
  Bool,
  Circuit,
  Field,
  SmartContract,
  state,
  State,
  isReady,
  Mina,
  Party,
  PrivateKey,
  PublicKey,
  method,
  UInt64,
  shutdown,
  Poseidon,
  UInt32,
} from 'snarkyjs';

export default class AgeProof extends SmartContract {
  @state(PublicKey) ownerAddr = State<PublicKey>();
  @state(UInt32) yearOfBirth = State<UInt32>();
  @state(UInt32) minimumYear = State<UInt32>();
  @state(UInt32) actualAge = State<UInt32>();
  @state(UInt32) minimumAge = State<UInt32>();
  @state(Field) proof = State<Field>();
  @state(Field) encryptedAge = State<Field>();

  // initialization
  deploy(initialBalance: UInt64, ownerAddr: PublicKey) {
    super.deploy();
    this.ownerAddr.set(ownerAddr);
    this.balance.addInPlace(initialBalance);
  }

  @method async createHashChainProof(seed: Field, yearOfBirth: number) {
    this.proof.set(Poseidon.hash([seed]));
    this.yearOfBirth.set(new UInt32(Field(yearOfBirth)));
    let actualAge = new UInt32(Field(new Date().getFullYear())).sub(yearOfBirth);
    console.log("curr year", new Date().getFullYear(), "actage", Number(actualAge));
    this.actualAge.set(actualAge);

    let encryptedAge = Poseidon.hash([seed]);
    for (let index = 1; index <= Number(actualAge); index++) {
      encryptedAge = Poseidon.hash([encryptedAge]);
    }
    this.encryptedAge.set(encryptedAge);
  }

  @method async verifyIfBornBefore(minimumYear: number, proofOfDiff: Field) {
    this.minimumYear.set(new UInt32(Field(minimumYear)));
    let minimumAge = new UInt32(Field(new Date().getFullYear())).sub(minimumYear);
    this.minimumAge.set(minimumAge);

    console.log("minimumAge", Number(minimumAge));

    let verifiedAge = proofOfDiff;
    verifiedAge = hashNTimes(Number(minimumAge), verifiedAge);

    let ea = await this.encryptedAge.get();

    let eaStr = (await this.encryptedAge.get()).toString();
    let vaStr = verifiedAge.toString();

    console.log("Proof:", await this.proof.get());
    console.log("Encr Age:", await this.encryptedAge.get(), eaStr, Field(eaStr));//, (await this.encryptedAge.get()).toBits());
    console.log("Verified Age:", verifiedAge, vaStr, Field(vaStr));//, verifiedAge.toBits());

    // ((await this.encryptedAge.get()).equals(verifiedAge))

    let a = Field(1);
    let b = Field(0);
    // let msg = Circuit.if(new Bool(Field(eaStr).equals(Field(vaStr))), "you've proven ur age... welcome!", "sorry, kid!");
    let res = Circuit.if(new Bool(eaStr === vaStr), a, b);
    console.log("res", res, res.toString());
    console.log(res.toString() == "1" ? "you've proven ur age... welcome!" : "sorry, kid!");

    return res.equals(1);

    // (await this.encryptedAge.get()).assertEquals(verifiedAge);
  }
}

function hashNTimes(n: number, value: Field) {
  for (let index = 0; index < n; index++) {
    value = Poseidon.hash([value]);
  }
  return value;
}

export async function run() {
  await isReady;

  const Local = Mina.LocalBlockchain();
  Mina.setActiveInstance(Local);
  const account1 = Local.testAccounts[0].privateKey;
  const account2 = Local.testAccounts[1].privateKey;
  const account3 = Local.testAccounts[2].privateKey;

  const snappPrivkey = PrivateKey.random();
  const snappPubkey = snappPrivkey.toPublicKey();

  let snappInstance: AgeProof;
  let randomSeed = Field.random();
  let yearOfBirth = 2004;
  let minimumYear = new Date().getFullYear() - 18;// 2004;

  // deploy the snapp
  await Mina.transaction(account1, async () => {
    // account2 sends 1000000000 to the new snapp account
    const amount = UInt64.fromNumber(1000000000);
    const p = await Party.createSigned(account2);
    p.balance.subInPlace(amount);
    snappInstance = new AgeProof(snappPubkey);
    snappInstance.deploy(amount, account1.toPublicKey());
  })
    .send()
    .wait();
  console.log(
    'snapp balance after deployment: ',
    (await Mina.getBalance(snappPubkey)).toString()
  );
  await Mina.transaction(account2, async () => {
    snappInstance.createHashChainProof(randomSeed, yearOfBirth);
  })
    .send()
    .wait();
  let difference = minimumYear - yearOfBirth;
  let proofOfDiff = hashNTimes(difference, Poseidon.hash([randomSeed]));

  const a = await Mina.getAccount(snappPubkey);
  console.log('hash of the age is:', a.snapp.appState[0].toString());
  try {
    await Mina.transaction(account3, async () => {
      snappInstance.verifyIfBornBefore(minimumYear, proofOfDiff);
    })
      .send()
      .wait();
  } catch (e) {
    console.log(e);
  }
}

run();
shutdown();
