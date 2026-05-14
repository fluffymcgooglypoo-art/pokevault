import { Router, type IRouter } from "express";
import healthRouter from "./health";
import cardsRouter from "./cards";
import nfcRouter from "./nfc";
import pricesRouter from "./prices";
import overlayRouter from "./overlay";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(cardsRouter);
router.use(nfcRouter);
router.use(pricesRouter);
router.use(overlayRouter);
router.use(dashboardRouter);

export default router;
