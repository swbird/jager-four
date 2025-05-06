import {readEvmAddressesAndKeys} from './utils.js';
import {ethers} from 'ethers';
import axios from 'axios';
import {fourAbi,erc20ABI} from './abi.js';
import {batchAnalyzeTxActionBalanceChangeWithEvent, rawTxToTx} from './simBundle.js';
import { doLogin } from './login.js';
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
    // console.log(privateKey);
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

async function buildFourBuyApproveSellTx(token, valueIn, tokenAmoutIn,minBNBReceivedBig, privateKey){
    const wallet = new ethers.Wallet(privateKey, provider);
    const router = "0x5c952063c7fc8610FFDB798152D69F0B9550762b"
    const nonce = await provider.getTransactionCount(wallet.address);
    const approveData = encodeContractData(erc20ABI, "approve", [router, ethers.MaxUint256]);
    const approveRawTx = await signTransaction(approveData, token,1, 220000,  0, nonce, privateKey);
    const buyData = await encodeContractData(fourAbi, "buyTokenAMAP", [token, ethers.parseEther(valueIn.toString()), ethers.parseUnits("0", 18)]);
    const buyRawTx = await signTransaction(buyData, router, 1,250000, valueIn, nonce+1, privateKey);
    const sellData = await encodeContractData(fourAbi, "sellToken", [token, ethers.parseEther(tokenAmoutIn.toString()), minBNBReceivedBig]);
    const sellRawTx = await signTransaction(sellData, router, 1,250000, 0, nonce+2, privateKey);
    const bundle = [approveRawTx, buyRawTx, sellRawTx];
    return bundle;
}
async function sendFourBuyApproveSellTx(bundle){
    const result = await sendBundle(bundle);
    return result;
}
/**
 * 测试批量分析交易
 * @param {string} privateKey - 私钥
 * @param {string} tokenAddress - 代币地址
 * @param {number} valueIn - 输入金额
 */
async function doIt(privateKey, tokenAddress, valueIn) {
    try {
        const wallet = new ethers.Wallet(privateKey, provider);
        
        // 检查余额
        const balance = await provider.getBalance(wallet.address);
        const requiredBalance = ethers.parseEther((valueIn + 0.002).toString());
        
        if (balance < requiredBalance) {
            console.error('余额不足！');
            console.log('当前余额:', ethers.formatEther(balance), 'BNB');
            console.log('所需余额:', ethers.formatEther(requiredBalance), 'BNB');
            return;
        }

        const router = "0x5c952063c7fc8610FFDB798152D69F0B9550762b";
        const nonce = await provider.getTransactionCount(wallet.address);

        // 构建三个交易
        const approveData = encodeContractData(erc20ABI, "approve", [router, ethers.MaxUint256]);
        const approveRawTx = await signTransaction(approveData, tokenAddress, 1, 220000, 0, nonce, privateKey);
        
        var buyData = encodeContractData(fourAbi, "buyTokenAMAP", [
            tokenAddress, 
            ethers.parseEther(valueIn.toString()), 
            ethers.parseUnits("0", 18)
        ]);
        var buyRawTx = await signTransaction(buyData, router, 1, 250000, valueIn, nonce + 1, privateKey);
        
        const sellData = encodeContractData(fourAbi, "sellToken", [
            tokenAddress, 
            ethers.parseUnits("1", 18), 
            ethers.parseUnits("0", 18)
        ]);
        var sellRawTx = await signTransaction(sellData, router, 1, 250000, 0, nonce + 2, privateKey);


        // const bundles = await buildFourBuyApproveSellTx(tokenAddress, valueIn, ethers.parseUnits("1", 18), privateKey);
        // console.log("result=>",bundles);

        // 转换为交易对象
        var txApprove = rawTxToTx(approveRawTx, wallet.address);
        var txBuy = rawTxToTx(buyRawTx, wallet.address);
        var txSell = rawTxToTx(sellRawTx, wallet.address);


        
        // 调用批量分析函数
        var [balanceChanges, gasUseds, revert] = await batchAnalyzeTxActionBalanceChangeWithEvent(
            [txApprove, txBuy, txSell],
            0,
            false
        );
        const balanceChange2 = balanceChanges[1];
        // console.log("tokenAddress=>",tokenAddress.toLowerCase(),"wallet.address=>",wallet.address.toLowerCase());
        const myToeknBalChange = balanceChange2.get(tokenAddress.toLowerCase()).get(wallet.address.toLowerCase());


        var bundles = await buildFourBuyApproveSellTx(tokenAddress, valueIn, ethers.formatEther(myToeknBalChange), ethers.parseEther("0.000000000000000001"), privateKey); // 先给哥最小值
        // console.log("result=>",bundles);

        // 转换为交易对象
        // const txApprove = rawTxToTx(approveRawTx, wallet.address); 
         txBuy = rawTxToTx(bundles[1], wallet.address);
         txSell = rawTxToTx(bundles[2], wallet.address);


         [balanceChanges, gasUseds, revert] = await batchAnalyzeTxActionBalanceChangeWithEvent(
            [txApprove, txBuy, txSell],
            0,
            false
        );
        // console.log("balanceChanges2=>",balanceChanges[2]);
        var receivedBNB = balanceChanges[2].get('0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee').get(wallet.address.toLowerCase());
        console.log("receivedBNB=>",receivedBNB);


        var bundlesFinal = await buildFourBuyApproveSellTx(tokenAddress, valueIn, ethers.formatEther(myToeknBalChange), receivedBNB, privateKey); // 先给哥最小值
        // console.log("resultFinal=>",bundlesFinal);
        const resultFinal = await sendFourBuyApproveSellTx(bundlesFinal);
        console.log("resultFinal=>",resultFinal);
        // 打印结果
        // console.log('分析结果:');
        // console.log('是否回滚:', revert);
        // console.log('Gas使用量:', gasUseds);
        
        // console.log("balanceChange2=>",balanceChange2);
        // console.log("tokenAddress=>",tokenAddress.toLowerCase(),"wallet.address=>",wallet.address.toLowerCase());
        // const myToeknBalChange = balanceChange2.get(tokenAddress.toLowerCase()).get(wallet.address.toLowerCase());
        // console.log("myToeknBalChange=>",myToeknBalChange);
        // 打印余额变化
        // balanceChanges.forEach((changes, index) => {
        //     console.log(`\n交易 ${index + 1} 的余额变化:`);
        //     changes.forEach((innerChanges, addr) => {
        //         console.log(`地址 ${addr}:`);
        //         innerChanges.forEach((amount, targetAddr) => {
        //             console.log(`  对 ${targetAddr} 的变化: ${ethers.formatEther(amount)} `);
        //         });
        //     });
        // });

    } catch (error) {
        console.error('测试失败:', error);
    }
}

/**
 * 等待指定时间
 * @param {number} ms - 等待的毫秒数
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 执行单个账号的任务
 * @param {string} privateKey - 私钥
 * @param {string} tokenAddress - 代币地址
 * @param {number} valueIn - 输入金额
 * @returns {Promise<boolean>} 是否执行成功
 */
async function executeTask(privateKey, tokenAddress, valueIn) {
    try {
        await doIt(privateKey, tokenAddress, valueIn);
        return true;
    } catch (error) {
        console.error('执行任务失败:', error);
        return false;
    }
}

// 修改main函数来测试
async function main() {


    
    try {
        const evmAddressesAndKeys = readEvmAddressesAndKeys('./addrs.txt');
        // const token = await doLogin(evmAddressesAndKeys.secks[0])
        // console.log("token=>",token);
        // return
        const tokenAddress = "0x4db02daf49115fe8c2d945e00c28ff371c6b99f3"; // 代币地址
        const valueIn = 0.01; // 输入金额

        console.log(`开始执行任务，共 ${evmAddressesAndKeys.secks.length} 个账号`);
        
        for (let i = 0; i < evmAddressesAndKeys.secks.length; i++) {
            const privateKey = evmAddressesAndKeys.secks[i];
            const address = evmAddressesAndKeys.addrs[i];
            
            console.log(`\n执行第 ${i + 1}/${evmAddressesAndKeys.secks.length} 个账号: ${address}`);
            const token = await doLogin(privateKey)
            console.log("token=>",token);
            await sleep(3000);
            const success = await executeTask(privateKey, tokenAddress, valueIn);
            
            if (!success) {
                console.log(`账号 ${address} 执行失败，等待10 秒后继续下一个账号...`);
                await sleep(10000);
            }
        }
        
        console.log('\n所有账号执行完毕！');
    } catch (error) {
        console.error('程序执行出错:', error);
    }
}

main().catch(console.error);

