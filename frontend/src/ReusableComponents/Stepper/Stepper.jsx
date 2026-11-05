import { Container, Row, Col } from "reactstrap";
import './stepper.css';

export default function Stepper({ steps, activeStep, handleClick }) {

    return (
        <Container className="stepper-container">
            {/* Step Circles */}
            <Row className="justify-content-between align-items-start stepper-circles-row">
                {steps?.map((step, index) => {
                    const isActive = index === activeStep;
                    const isCompleted = index < activeStep;

                    return (
                        <Col key={index} className="text-center stepper-col">
                            <div className={`step-circle 
                                ${isActive ? "active" : ""} 
                                ${isCompleted ? "completed" : ""}`}
                                onClick={handleClick ? () => handleClick(index) : null}
                            >
                                {isCompleted && <span className="checkmark">&#10003;</span>}
                            </div>
                            {index !== steps?.length - 1 && (
                                <div className="step-line"></div>
                            )}
                        </Col>
                    );
                })}
            </Row>

            {/* Step Labels */}
            <Row className="justify-content-between stepper-labels-row">
                {steps?.map((step, index) => {
                    const isActive = index === activeStep;

                    return (
                        <Col key={index} className="text-center stepper-col">
                            <div className={`step-label ${isActive ? "active" : ""}`}>
                                {step.title}
                            </div>
                        </Col>
                    );
                })}
            </Row>
        </Container>
    );
}
