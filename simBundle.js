import { ethers } from 'ethers';
import axios from 'axios';
const rpc = 'http://birdonline.xyz:8501/bsc'
// 初始化 provider
const provider = new ethers.JsonRpcProvider(rpc);

// 定义 Transfer 事件的主题
const TRANSFER_EVENT_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

// ERC20 Transfer 事件的 ABI
const transferEventABI = [
    "event Transfer(address indexed from, address indexed to, uint256 value)"
];

// 创建接口用于解析事件
const transferInterface = new ethers.Interface(transferEventABI);

/**
 * 解析 ERC20 Transfer 事件
 * @param {Array} logs - 日志数组
 * @param {boolean} includeNft - 是否包含NFT
 * @returns {Array} ERC20转账事件数组
 */
function parseERC20TransferEvent(logs, includeNft) {
    const erc20TransferEvents = [];
    
    for (const log of logs) {
        const data = log.data;
        const contractAddress = log.address.toLowerCase();
        const topics = log.topics;

        if (topics.length < 3) {
            continue;
        }

        if (includeNft) {
            // TODO: 实现 NFT 事件解析
        }

        if (topics[0] !== TRANSFER_EVENT_TOPIC) {
            continue;
        }

        try {
            // 使用 ethers.js 解析事件数据
            const parsedLog = transferInterface.parseLog({
                topics: topics,
                data: data
            });

            if (parsedLog) {
                erc20TransferEvents.push({
                    contract: contractAddress,
                    from: parsedLog.args[0].toLowerCase(),
                    to: parsedLog.args[1].toLowerCase(),
                    amount: parsedLog.args[2]
                });
            }
        } catch (error) {
            console.error('解析事件失败:', error);
            continue;
        }
    }

    return erc20TransferEvents;
}

/**
 * 显示 ERC20 余额变化
 * @param {Object} call - 调用结果
 * @param {Map} valueChanges - 余额变化映射
 * @param {boolean} includeNft - 是否包含NFT
 */
function showERC20BalanceChangeNew(call, valueChanges, includeNft) {
    // 处理原生代币转账
    if (call.value && call.value !== '0x0') {
        const value = BigInt(call.value);
        const contract = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
        const from = call.from.toLowerCase();
        const to = call.to.toLowerCase();

        if (!valueChanges.has(contract)) {
            valueChanges.set(contract, new Map());
        }

        const contractChanges = valueChanges.get(contract);
        
        // 处理发送方余额变化
        contractChanges.set(from, (contractChanges.get(from) || BigInt(0)) - value);
        
        // 处理接收方余额变化
        contractChanges.set(to, (contractChanges.get(to) || BigInt(0)) + value);
    }

    // 处理 ERC20 转账事件
    if (call.logs && call.logs.length > 0) {
        // console.log('处理 ERC20 事件，日志数量:', call.logs.length);
        const erc20TransferEvents = parseERC20TransferEvent(call.logs, includeNft);
        // console.log('解析出的 ERC20 事件数量:', erc20TransferEvents.length);
        
        for (const event of erc20TransferEvents) {
            if (!valueChanges.has(event.contract)) {
                valueChanges.set(event.contract, new Map());
            }

            const contractChanges = valueChanges.get(event.contract);
            
            // 处理发送方余额变化
            contractChanges.set(event.from, (contractChanges.get(event.from) || BigInt(0)) - event.amount);
            
            // 处理接收方余额变化
            contractChanges.set(event.to, (contractChanges.get(event.to) || BigInt(0)) + event.amount);
        }
    }
}

/**
 * 将原始交易转换为交易对象
 * @param {string} rawTx - 原始交易数据
 * @param {string} fromAddr - 发送地址
 * @returns {Object} 交易对象
 */
function rawTxToTx(rawTx, fromAddr) {
    try {
        const tx = ethers.Transaction.from(rawTx);
        return {
            from: fromAddr,
            to: tx.to,
            value: "0x" + tx.value.toString(16),
            input: tx.data,
            gas: "0x" + tx.gasLimit.toString(16)
        };
    } catch (error) {
        console.error('解析交易失败:', error);
        return {};
    }
}

/**
 * 批量分析交易并计算余额变化
 * @param {Array<Object>} transactions - 交易数组
 * @param {number} blockNumber - 区块号
 * @param {boolean} includeNft - 是否包含NFT
 * @returns {Promise<[Array<Map>, Array<number>, boolean]>} 余额变化、gas使用量和是否回滚
 */
async function batchAnalyzeTxActionBalanceChangeWithEvent(transactions, blockNumber = 0, includeNft = false) {
    try {
        const balanceChanges = [];
        const gasUseds = [];
        let bundleRevert = false;

        // 准备调用参数
        const blockNumberHex = blockNumber === 0 ? 'latest' : `0x${blockNumber.toString(16)}`;
        
        // 调用debug_batchTraceCall
        const response = await axios.post(rpc, {
            jsonrpc: '2.0',
            id: 1,
            method: 'debug_batchTraceCall',
            params: [
                transactions,
                blockNumberHex,
                {
                    tracerConfig: {
                        withLog: true
                    },
                    tracer: 'callTracer'
                }
            ]
        });

        if (response.data.error) {
            throw new Error(response.data.error.message);
        }

        const results = response.data.result;
        
        // 处理每个交易的结果
        for (let i = 0; i < transactions.length; i++) {
            const result = results[i];
            if (!result) {
                balanceChanges.push(new Map());
                gasUseds.push(0);
                continue;
            }

            // 检查是否回滚
            if (result.revertReason) {
                balanceChanges.push(new Map());
                gasUseds.push(0);
                continue;
            }

            // 计算余额变化
            const valueChanges = new Map();
            const revertReason = printCallNew(result, 0, valueChanges, includeNft);
            
            // 计算gas使用量
            const gasUsed = parseInt(result.gasUsed, 16);

            if (revertReason) {
                balanceChanges.push(new Map());
                gasUseds.push(0);
            } else {
                balanceChanges.push(valueChanges);
                gasUseds.push(gasUsed);
            }
        }

        // 检查是否有任何交易回滚
        bundleRevert = gasUseds.some(gas => gas === 0) || balanceChanges.length !== transactions.length;

        return [balanceChanges, gasUseds, bundleRevert];
    } catch (error) {
        console.error('批量分析交易失败:', error);
        return [[], [], true];
    }
}

/**
 * 递归处理调用结果并计算余额变化
 * @param {Object} call - 调用结果
 * @param {number} depth - 递归深度
 * @param {Map} valueChanges - 余额变化映射
 * @param {boolean} includeNft - 是否包含NFT
 * @returns {string} 回滚原因
 */
function printCallNew(call, depth, valueChanges, includeNft) {
    if (call.error) {
        return call.error + "=>" + (call.revertReason || '');
    }

    showERC20BalanceChangeNew(call, valueChanges, includeNft);

    if (call.calls) {
        for (const subCall of call.calls) {
            const revertReason = printCallNew(subCall, depth + 1, valueChanges, includeNft);
            if (revertReason) {
                return revertReason;
            }
        }
    }

    return '';
}

/**
 * 计算BNB成本
 * @param {number} gas - gas使用量
 * @param {bigint} gasPrice - gas价格
 * @returns {number} BNB成本
 */
function calculateCostBNB(gas, gasPrice) {
    const gasPriceFloat = Number(ethers.formatUnits(gasPrice, 9));
    return (gasPriceFloat * gas) / 1e9;
}

export {
    batchAnalyzeTxActionBalanceChangeWithEvent,
    rawTxToTx,
    calculateCostBNB
};
