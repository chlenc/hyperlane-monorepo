use async_trait::async_trait;
use color_eyre::{
    eyre::{eyre, WrapErr},
    Result,
};
use futures_util::future::{join_all, select_all};
use log::error;
use std::sync::Arc;

use crate::settings::Settings;
use optics_core::traits::{Home, Replica};

/// A trait for an application that runs on a replica and a reference to a
/// home.
#[async_trait]
pub trait OpticsAgent: Send + Sync + std::fmt::Debug {
    /// Run the agent with the given home and replica
    async fn run(&self, home: Arc<Box<dyn Home>>, replica: Box<dyn Replica>) -> Result<()>;

    /// Run the Agent, and tag errors with the slip44 ID of the replica
    async fn run_report_error(
        &self,
        home: Arc<Box<dyn Home>>,
        replica: Box<dyn Replica>,
    ) -> Result<()> {
        let slip44 = replica.destination_slip44();
        self.run(home, replica)
            .await
            .wrap_err_with(|| format!("Replica with ID {} failed", slip44))
    }

    #[allow(unreachable_code)]
    /// Run several agents
    async fn run_many(&self, home: Box<dyn Home>, replicas: Vec<Box<dyn Replica>>) -> Result<()> {
        let home = Arc::new(home);

        let mut futs: Vec<_> = replicas
            .into_iter()
            .map(|replica| self.run_report_error(home.clone(), replica))
            .collect();

        loop {
            // This gets the first future to resolve.
            let (res, _, remaining) = select_all(futs).await;
            if res.is_err() {
                error!("Replica shut down: {:#}", res.unwrap_err());
            }
            futs = remaining;
            if futs.is_empty() {
                return Err(eyre!("All replicas have shut down"));
            }
        }
        unreachable!()
    }

    /// Run several agents based on the settings
    async fn run_from_settings(&self, settings: &Settings) -> Result<()> {
        let home = settings
            .home
            .try_into_home("home")
            .await
            .wrap_err("failed to instantiate Home")?;

        let replicas = join_all(settings.replicas.iter().map(|(k, v)| async move {
            v.try_into_replica(k)
                .await
                .wrap_err_with(|| format!("Failed to instantiate replica named {}", k))
        }))
        .await
        .into_iter()
        .collect::<Result<Vec<_>>>()?;

        self.run_many(home, replicas).await
    }
}