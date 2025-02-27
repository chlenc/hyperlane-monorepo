#![allow(clippy::enum_variant_names)]
#![allow(missing_docs)]

use std::collections::HashMap;
use std::sync::Arc;

use async_trait::async_trait;
use ethers::providers::Middleware;
use tracing::instrument;

use hyperlane_core::{
    AggregationIsm, ChainResult, ContractLocator, HyperlaneAbi, HyperlaneChain, HyperlaneContract,
    HyperlaneDomain, HyperlaneMessage, HyperlaneProvider, RawHyperlaneMessage, H256,
};

use crate::contracts::i_aggregation_ism::{
    IAggregationIsm as EthereumAggregationIsmInternal, IAGGREGATIONISM_ABI,
};
use crate::trait_builder::BuildableWithProvider;
use crate::EthereumProvider;

pub struct AggregationIsmBuilder {}

#[async_trait]
impl BuildableWithProvider for AggregationIsmBuilder {
    type Output = Box<dyn AggregationIsm>;

    async fn build_with_provider<M: Middleware + 'static>(
        &self,
        provider: M,
        locator: &ContractLocator,
    ) -> Self::Output {
        Box::new(EthereumAggregationIsm::new(Arc::new(provider), locator))
    }
}

/// A reference to an AggregationIsm contract on some Ethereum chain
#[derive(Debug)]
pub struct EthereumAggregationIsm<M>
where
    M: Middleware,
{
    contract: Arc<EthereumAggregationIsmInternal<M>>,
    domain: HyperlaneDomain,
}

impl<M> EthereumAggregationIsm<M>
where
    M: Middleware + 'static,
{
    /// Create a reference to a mailbox at a specific Ethereum address on some
    /// chain
    pub fn new(provider: Arc<M>, locator: &ContractLocator) -> Self {
        Self {
            contract: Arc::new(EthereumAggregationIsmInternal::new(
                locator.address,
                provider,
            )),
            domain: locator.domain.clone(),
        }
    }
}

impl<M> HyperlaneChain for EthereumAggregationIsm<M>
where
    M: Middleware + 'static,
{
    fn domain(&self) -> &HyperlaneDomain {
        &self.domain
    }

    fn provider(&self) -> Box<dyn HyperlaneProvider> {
        Box::new(EthereumProvider::new(
            self.contract.client(),
            self.domain.clone(),
        ))
    }
}

impl<M> HyperlaneContract for EthereumAggregationIsm<M>
where
    M: Middleware + 'static,
{
    fn address(&self) -> H256 {
        self.contract.address().into()
    }
}

#[async_trait]
impl<M> AggregationIsm for EthereumAggregationIsm<M>
where
    M: Middleware + 'static,
{
    #[instrument(err)]
    async fn modules_and_threshold(
        &self,
        message: &HyperlaneMessage,
    ) -> ChainResult<(Vec<H256>, u8)> {
        let (isms, threshold) = self
            .contract
            .modules_and_threshold(RawHyperlaneMessage::from(message).to_vec().into())
            .call()
            .await?;
        let isms_h256 = isms.iter().map(|address| (*address).into()).collect();
        Ok((isms_h256, threshold))
    }
}

pub struct EthereumRoutingIsmAbi;

impl HyperlaneAbi for EthereumRoutingIsmAbi {
    const SELECTOR_SIZE_BYTES: usize = 4;

    fn fn_map() -> HashMap<Vec<u8>, &'static str> {
        super::extract_fn_map(&IAGGREGATIONISM_ABI)
    }
}
