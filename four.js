import {readEvmAddressesAndKeys} from './utils.js';
import {ethers} from 'ethers';
import axios from 'axios';
import {fourAbi,erc20ABI} from './abi.js';

// 初始化 provider
const provider = new ethers.JsonRpcProvider('https://bsc-dataseed.binance.org/');

/**
 * 编码合约调用数据
 * @param {string} abi - 合约 ABI
 * @param {string} functionName - 函数名
 * @param {Array} params - 函数参数
 * @returns {string} 编码后的数据
 */
function encodeContractData(abi, functionName, params) {
    const iface = new ethers.Interface(abi);
    return iface.encodeFunctionData(functionName, params);
}

/**
 * 生成签名交易
 * @param {string} data - 编码后的数据
 * @param {string} to - 目标合约地址
 * @param {number} gasPrice - gas价格（gwei）
 * @param {number} gas - gas限制
 * @param {number} value - 发送的BNB数量
 * @param {number} nonce - 交易nonce
 * @param {string} privateKey - 私钥
 * @returns {string} 签名后的原始交易数据
 */
async function signTransaction(data, to, gasPrice, gas, value, nonce, privateKey) {
    console.log(privateKey);
    const wallet = new ethers.Wallet(privateKey, provider);
    const tx = {
        to: to, // 目标合约地址
        data: data,
        gasPrice: ethers.parseUnits(gasPrice.toString(), 'gwei'),
        gasLimit: gas,
        value: ethers.parseEther(value.toString()),
        nonce: nonce,
        chainId: 56 // BSC主网chainId
    };
    
    const signedTx = await wallet.signTransaction(tx);
    return signedTx;
}

/**
 * 发送bundle到BSC网络
 * @param {Array<string>} rawTxs - 签名后的原始交易数组
 * @returns {Promise<Object>} 交易结果
 */
async function sendBundle(rawTxs) {
    try {
        const response = await axios.post('https://puissant-builder.48.club/', {
            "jsonrpc": "2.0",
            "id": "1",
            "method": "eth_sendBundle",
            "params": [
              {
                "txs":rawTxs,    // List of signed raw transactions
            }
            ],
            "id": 1
          },{
            headers: {
                'Content-Type': 'application/json'
            }
          }
        );
        
        return response.data;
    } catch (error) {
        console.error('发送bundle失败:', error);
        throw error;
    }
}

async function fourBuyApproveSell(token, valueIn, privateKey){
    const wallet = new ethers.Wallet(privateKey, provider);
    const router = "0x5c952063c7fc8610FFDB798152D69F0B9550762b"
    const nonce = await provider.getTransactionCount(wallet.address);
    const approveData = encodeContractData(erc20ABI, "approve", [router, ethers.MaxUint256]);
    const approveRawTx = await signTransaction(approveData, token, 220000, 0, 0, nonce, privateKey);
}
async function main() {
    
    const evmAddressesAndKeys = readEvmAddressesAndKeys('./addrs.txt');

    console.log(evmAddressesAndKeys);
    const expKey = evmAddressesAndKeys.secks[0];
    const expAddr = evmAddressesAndKeys.addrs[0];

    // 示例参数
    const functionName = "transfer";
    const params = ["0xd715f6DaBC496c7eb7Ff5324cc01419E6fB3F346", ethers.parseEther("1.0")];
    
    // 编码数据
    const encodedData = encodeContractData(erc20ABI, functionName, params);
    console.log(encodedData);
    console.log(expAddr,expKey);
    const signedTx = await signTransaction(
        encodedData,
        "0xd715f6DaBC496c7eb7Ff5324cc01419E6fB3F346",
        1,
        220000,
        0,
        0,
        expKey
    );
    console.log(signedTx);
}

main().catch(console.error);

